const choiceDialog = document.querySelector('#accountTypeDialog');
const personalSignupButton = document.querySelector('#accountTypePersonal');
let bypassNextRegisterClick = false;

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-open="register"]');
  if (!trigger || document.querySelector('#modalBody')?.contains(trigger)) return;

  if (bypassNextRegisterClick) {
    bypassNextRegisterClick = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  choiceDialog.showModal();
}, true);

personalSignupButton.addEventListener('click', () => {
  choiceDialog.close();
  const registerTrigger = document.querySelector('[data-open="register"]');
  if (!registerTrigger) return;
  bypassNextRegisterClick = true;
  registerTrigger.click();
});

document.querySelector('#accountTypeClose').addEventListener('click', () => choiceDialog.close());
choiceDialog.addEventListener('click', (event) => {
  if (event.target === choiceDialog) choiceDialog.close();
});
