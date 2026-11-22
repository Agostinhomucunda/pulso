const choiceDialog = document.querySelector('#accountTypeDialog');
const personalChoice = document.querySelector('#accountTypePersonal');
const choiceTitle = document.querySelector('#accountTypeTitle');
const choiceKicker = document.querySelector('.account-type-kicker');
const choiceIntro = document.querySelector('#accountTypeIntro');
const choiceNote = document.querySelector('.account-type-note');
let choiceMode = 'register';
let activeTrigger = null;
let bypassNextChoiceTrigger = false;

const copy = {
  register: {
    kicker: 'Criar conta no PULSO',
    title: 'Que tipo de acesso procuras?',
    intro: 'Escolhe a opção que corresponde ao teu objectivo. Os pedidos empresariais e de parceria são revistos separadamente.',
    note: 'Os pedidos empresariais e de parceria usam a conta PULSO normal; se ainda não tens uma, cria primeiro uma conta normal e depois regressa para submeter o pedido.',
  },
  login: {
    kicker: 'Aceder ao PULSO',
    title: 'Onde queres entrar?',
    intro: 'Escolhe a conta normal, empresarial ou parceira. A autenticação é a mesma; os painéis organizacionais só abrem quando o acesso está aprovado.',
    note: 'A escolha não concede permissões. Se o acesso empresarial ou de parceiro ainda estiver em análise, poderás consultar o estado do pedido.',
  },
};

function openChoice(mode, trigger) {
  choiceMode = mode;
  activeTrigger = trigger;
  choiceKicker.textContent = copy[mode].kicker;
  choiceTitle.textContent = copy[mode].title;
  choiceIntro.textContent = copy[mode].intro;
  choiceNote.textContent = copy[mode].note;
  if (mode === 'register') sessionStorage.removeItem('pulso-preferred-workspace');
  choiceDialog.showModal();
}

function continueToAuth(workspace) {
  choiceDialog.close();
  if (choiceMode === 'login') {
    sessionStorage.setItem('pulso-preferred-workspace', workspace);
    const loginTrigger = activeTrigger;
    activeTrigger = null;
    if (!loginTrigger) return;
    bypassNextChoiceTrigger = true;
    loginTrigger.click();
    return;
  }
  const registerTrigger = activeTrigger || document.querySelector('[data-open="register"]');
  activeTrigger = null;
  if (!registerTrigger) return;
  bypassNextChoiceTrigger = true;
  registerTrigger.click();
}

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open="register"], [data-open="login"]');
  if (!trigger) return;

  if (bypassNextChoiceTrigger) {
    bypassNextChoiceTrigger = false;
    return;
  }

  const insideAuthModal = document.querySelector('#modalBody')?.contains(trigger);
  if (insideAuthModal && trigger.dataset.open !== 'login') return;

  event.preventDefault();
  event.stopImmediatePropagation();
  openChoice(trigger.dataset.open === 'login' ? 'login' : 'register', trigger);
}, true);

personalChoice.addEventListener('click', () => {
  continueToAuth(choiceMode === 'login' ? 'personal' : 'personal');
});

choiceDialog.addEventListener('click', (event) => {
  const workspaceLink = event.target.closest('[data-workspace]');
  if (!workspaceLink || choiceMode !== 'login') return;
  event.preventDefault();
  continueToAuth(workspaceLink.dataset.workspace);
  return;
});

document.querySelector('#accountTypeClose').addEventListener('click', () => {
  choiceDialog.close();
  activeTrigger = null;
});
choiceDialog.addEventListener('close', () => {
  if (!choiceDialog.open) activeTrigger = null;
});
choiceDialog.addEventListener('click', (event) => {
  if (event.target === choiceDialog) choiceDialog.close();
});
