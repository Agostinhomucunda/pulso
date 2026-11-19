#!/usr/bin/env python3
"""Collect public opportunity cards without bypassing robots, auth or paywalls.

Official/public-job sources may be published automatically when the extracted
record passes the validation gate. News and uncertain sources are written to a
review queue and are never exposed by the public catalogue automatically.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / "data" / "sources.json"
OUTPUT_FILE = ROOT / "data" / "opportunities.json"
REVIEW_FILE = ROOT / "data" / "review-queue.json"
ORGANIZATIONS_FILE = ROOT / "data" / "organizations.json"

KEYWORDS = {
    "employment": ("emprego", "vaga", "recrutamento", "carreira", "trabalh", "job", "career"),
    "scholarship": ("bolsa", "scholarship", "financiamento", "fellowship"),
    "public_competition": ("concurso", "admissão", "admissao", "função pública", "funcao publica"),
    "internship": ("estágio", "estagio", "trainee", "internship"),
    "training": ("formação", "formacao", "curso", "capacitação", "capacitacao", "training"),
    "recruitment_program": ("programa de recrutamento", "recruitment program", "young professionals"),
}
OPPORTUNITY_HINTS = tuple(word for words in KEYWORDS.values() for word in words)
EXPLICIT_OPPORTUNITY_HINTS = ("vaga", "vagas", "concurso", "candidatura", "candidaturas", "inscrição", "inscricao", "admissão", "admissao", "bolsa", "estágio", "estagio", "recrutamento", "curso", "formação", "formacao", "fellowship", "scholarship", "job opportunity")

def has_explicit_hint(text: str) -> bool:
    lowered = (text or "").lower()
    return any(re.search(rf"(?<![\wà-ÿ]){re.escape(word)}[\wà-ÿ]*", lowered) for word in EXPLICIT_OPPORTUNITY_HINTS)


@dataclass
class Candidate:
    id: str
    title: str
    public_summary: str
    category: str
    sector: str
    province: str
    municipality: str
    vacancies: int | None
    application_deadline: str | None
    published_at: str | None
    source_name: str
    source_url: str
    application_url: str
    organization: dict
    source_id: str
    collection_method: str
    verification_status: str


class LinkParser(HTMLParser):
    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.links: list[tuple[str, str]] = []
        self.current_href = ""
        self.current_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            href = dict(attrs).get("href", "")
            self.current_href = urllib.parse.urljoin(self.base_url, href)
            self.current_text = []

    def handle_data(self, data):
        if self.current_href:
            self.current_text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self.current_href:
            text = re.sub(r"\s+", " ", " ".join(self.current_text)).strip()
            if text and self.current_href.startswith(("http://", "https://")):
                self.links.append((text, self.current_href))
            self.current_href = ""
            self.current_text = []


def fetch(url: str, timeout: int, user_agent: str) -> tuple[str, str]:
    request = urllib.request.Request(url, headers={"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get_content_type()
        raw = response.read(2_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
        return content_type, raw.decode(charset, errors="replace")


def clean(value: str, limit: int = 360) -> str:
    value = html.unescape(re.sub(r"\s+", " ", value or "")).strip()
    return value[:limit].rstrip()


def canonical(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(k, v) for k, v in query if not k.lower().startswith(("utm_", "fbclid", "gclid"))]
    return urllib.parse.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/") or "/", urllib.parse.urlencode(query), ""))


def classify(text: str) -> str:
    lowered = clean(text, 2000).lower()
    for category, words in KEYWORDS.items():
        if any(word in lowered for word in words):
            return category
    return "employment"


def date_from_text(text: str) -> str | None:
    match = re.search(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b", text)
    if match:
        return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    match = re.search(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b", text)
    if match:
        return f"{match.group(3)}-{int(match.group(2)):02d}-{int(match.group(1)):02d}"
    return None


def xml_candidates(content: str, source: dict, base_url: str) -> list[tuple[str, str, str, str | None]]:
    results = []
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return results
    for item in root.iter():
        tag = item.tag.rsplit("}", 1)[-1].lower()
        if tag not in {"item", "url", "entry"}:
            continue
        fields = {child.tag.rsplit("}", 1)[-1].lower(): (child.text or "").strip() for child in item.iter() if child is not item}
        link = fields.get("link", "")
        if not link:
            for child in item.iter():
                if child.tag.rsplit("}", 1)[-1].lower() == "link":
                    link = child.attrib.get("href", "") or (child.text or "")
                    if link:
                        break
        link = urllib.parse.urljoin(base_url, link)
        title = fields.get("title", "")
        summary = fields.get("description", "") or fields.get("summary", "") or fields.get("content", "")
        published = fields.get("pubdate") or fields.get("published") or fields.get("updated") or fields.get("lastmod")
        if title and link.startswith("https://") and has_explicit_hint(f"{title} {summary}"):
            results.append((clean(title, 180), canonical(link), clean(summary), date_from_text(published or summary)))
    return results


def html_candidates(content: str, source: dict, base_url: str) -> list[tuple[str, str, str, str | None]]:
    parser = LinkParser(base_url)
    parser.feed(content)
    results = []
    base_host = urllib.parse.urlsplit(base_url).netloc.lower()
    for text, link in parser.links:
        parsed = urllib.parse.urlsplit(link)
        if parsed.scheme != "https" or parsed.netloc.lower() != base_host:
            continue
        combined = f"{text} {parsed.path}".lower()
        if len(text) < 18:
            continue
        text_lower = text.lower()
        path_lower = parsed.path.lower()
        if not has_explicit_hint(text_lower) or has_explicit_hint(path_lower):
            continue
        results.append((clean(text, 180), canonical(link), clean(text), date_from_text(text)))
    return results


def valid_candidate(title: str, link: str, source: dict) -> bool:
    return bool(title and len(title) >= 12 and link.startswith("https://") and urllib.parse.urlsplit(link).netloc)


def make_candidate(source: dict, title: str, link: str, summary: str, published: str | None) -> Candidate:
    domain = urllib.parse.urlsplit(link).netloc
    org = {"name": source["name"], "official_website": f"https://{domain}"}
    digest = hashlib.sha256(canonical(link).encode()).hexdigest()[:20]
    return Candidate(
        id=f"auto-{digest}", title=title, public_summary=clean(summary or title),
        category=classify(f"{title} {summary}"), sector="", province="Angola", municipality="",
        vacancies=None, application_deadline=None, published_at=published,
        source_name=source["name"], source_url=link, application_url=link,
        organization=org, source_id=source["id"], collection_method="automatic",
        verification_status="verified" if source.get("auto_publish") else "pending_review",
    )


def main() -> int:
    config = json.loads(SOURCES_FILE.read_text())
    policy = config["policy"]
    auto_items: dict[str, Candidate] = {}
    review_items: dict[str, Candidate] = {}
    errors = []
    for source in config["sources"]:
        seen = 0
        for url in source["urls"]:
            try:
                content_type, content = fetch(url, policy["request_timeout_seconds"], policy["user_agent"])
                if "xml" in content_type or content.lstrip().startswith("<") and ("<rss" in content[:500].lower() or "<urlset" in content[:500].lower() or "<feed" in content[:500].lower()):
                    found = xml_candidates(content, source, url)
                else:
                    found = html_candidates(content, source, url)
                for title, link, summary, published in found:
                    if seen >= policy["max_items_per_source"] or not valid_candidate(title, link, source):
                        continue
                    item = make_candidate(source, title, link, summary, published)
                    target = auto_items if source.get("auto_publish") else review_items
                    target[item.id] = item
                    seen += 1
            except Exception as exc:  # one source must not stop the whole collection
                errors.append({"source_id": source["id"], "url": url, "error": str(exc)[:240]})
            time.sleep(0.2)
    def sort_key(item: Candidate):
        return (item.get("published_at") or "0000-00-00", item.get("title", "").lower())
    auto = sorted((asdict(item) for item in auto_items.values()), key=sort_key, reverse=True)[:200]
    review = sorted((asdict(item) for item in review_items.values()), key=sort_key, reverse=True)[:500]
    organizations = {}
    for item in auto:
        org = item["organization"]
        organizations[org["name"]] = {"id": "auto-" + hashlib.sha256(org["name"].encode()).hexdigest()[:16], **org, "verification_status": "verified"}
    generated_at = datetime.now(timezone.utc).isoformat()
    payload = {"generated_at": generated_at, "source_count": len(config["sources"]), "opportunities": auto}
    review_payload = {"generated_at": generated_at, "items": review, "errors": errors}
    organizations_payload = {"generated_at": generated_at, "organizations": list(organizations.values())}

    def stable_write(path: Path, value: dict):
        if path.exists():
            try:
                previous = json.loads(path.read_text())
                comparable = lambda item: {k: v for k, v in item.items() if k != "generated_at"}
                if comparable(previous) == comparable(value):
                    value["generated_at"] = previous.get("generated_at")
            except (json.JSONDecodeError, OSError):
                pass
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

    stable_write(OUTPUT_FILE, payload)
    stable_write(REVIEW_FILE, review_payload)
    stable_write(ORGANIZATIONS_FILE, organizations_payload)
    print(json.dumps({"published": len(auto), "review": len(review), "errors": len(errors)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
