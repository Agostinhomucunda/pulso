const ICONS = {
  confirm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"/><path d="M12 8v4m0 4h.01"/></svg>',
  danger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></svg>',
  error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>',
  success: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
};

function createDialog({ title, message, kind, confirmLabel, cancelLabel, variant }) {
  const dialog = document.createElement('dialog');
  dialog.className = `pulso-dialog pulso-dialog--${variant}`;
  dialog.setAttribute('aria-labelledby', 'pulsoDialogTitle');
  dialog.setAttribute('aria-describedby', 'pulsoDialogMessage');

  const panel = document.createElement('div');
  panel.className = 'pulso-dialog__panel';

  const icon = document.createElement('span');
  icon.className = 'pulso-dialog__icon';
  icon.innerHTML = ICONS[variant] || ICONS.confirm;

  const content = document.createElement('div');
  content.className = 'pulso-dialog__content';
  const heading = document.createElement('h2');
  heading.id = 'pulsoDialogTitle';
  heading.textContent = title;
  const body = document.createElement('p');
  body.id = 'pulsoDialogMessage';
  body.textContent = message;
  content.append(heading, body);

  const actions = document.createElement('div');
  actions.className = 'pulso-dialog__actions';
  let cancelButton = null;
  if (kind === 'confirm') {
    cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'pulso-dialog__button pulso-dialog__button--secondary';
    cancelButton.textContent = cancelLabel;
    cancelButton.addEventListener('click', () => dialog.close('cancel'));
    actions.append(cancelButton);
  }

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = 'pulso-dialog__button pulso-dialog__button--primary';
  confirmButton.textContent = confirmLabel;
  confirmButton.addEventListener('click', () => dialog.close('confirm'));
  actions.append(confirmButton);

  panel.append(icon, content, actions);
  dialog.append(panel);

  return { dialog, cancelButton, confirmButton };
}

function openDialog(options) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const { dialog, cancelButton, confirmButton } = createDialog(options);
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      dialog.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(value);
    };

    dialog.addEventListener('close', () => finish(dialog.returnValue === 'confirm'), { once: true });
    dialog.addEventListener('click', event => {
      if (event.target === dialog && options.kind === 'confirm') dialog.close('cancel');
    });
    dialog.addEventListener('cancel', () => {
      if (options.kind === 'confirm') dialog.close('cancel');
    });
    document.body.append(dialog);
    dialog.showModal();
    (cancelButton || confirmButton).focus();
  });
}

export function showPulsoConfirm({
  title = 'Confirmar acção',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'confirm',
} = {}) {
  return openDialog({ title, message, kind: 'confirm', confirmLabel, cancelLabel, variant });
}

export function showPulsoAlert(message, { title = 'Não foi possível concluir', buttonLabel = 'Entendi', variant = 'error' } = {}) {
  return openDialog({ title, message, kind: 'alert', confirmLabel: buttonLabel, cancelLabel: '', variant });
}
