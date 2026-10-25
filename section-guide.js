(function () {
  'use strict';
  const descriptions = {
    corrida: 'Registre suas corridas e acompanhe distância, duração e evolução semanal.',
    natacao: 'Registre suas sessões de natação e acompanhe distância, duração e evolução semanal.',
    crossfit: 'Leia ou registre o WOD, confira os movimentos e revise o treino antes de salvar.',
    academia: 'Escolha uma ficha ou treino livre, registre as séries e finalize o treino do dia.',
    progresso: 'Consulte o calendário, a evolução dos treinos e os músculos trabalhados.',
    corpo: 'Registre seu peso e acompanhe a tendência ao longo do tempo.',
    agua: 'Adicione a água consumida e acompanhe a meta do dia.',
    dieta: 'Monte a refeição por qualquer método, revise os itens e conclua o lançamento.',
    cardapio: 'Organize alimentos e refeições recorrentes para facilitar os próximos lançamentos.',
    importar: 'Importe seus dados e confira os registros antes de usá-los no aplicativo.',
    mais: 'Ajuste as abas, os cartões e as conexões opcionais do aplicativo.'
  };
  const guide = document.getElementById('section-guide');
  const title = document.getElementById('section-guide-title');
  const help = document.getElementById('section-guide-help');
  const helpText = document.getElementById('section-guide-text');
  const tabs = document.querySelector('.tabs');
  if (!guide || !tabs) return;

  function render() {
    const active = tabs.querySelector('.tab.active[data-tab]');
    const key = active?.dataset.tab;
    guide.hidden = !key || key === 'inicio';
    if (guide.hidden) return;
    title.textContent = active.textContent.trim().replace(/^[^\p{L}\p{N}]+/u, '');
    helpText.textContent = descriptions[key] || 'Consulte e registre suas informações nesta seção.';
  }
  document.getElementById('section-guide-home').addEventListener('click', () => window.switchTab?.('inicio'));
  document.getElementById('section-guide-switch').addEventListener('click', () => {
    tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const active = tabs.querySelector('.tab.active[data-tab]');
    (active || tabs.querySelector('.tab[data-tab]'))?.focus({ preventScroll: true });
  });
  help.addEventListener('click', () => {
    const open = help.getAttribute('aria-expanded') !== 'true';
    help.setAttribute('aria-expanded', String(open));
    helpText.hidden = !open;
  });
  new MutationObserver(render).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] });
  render();
})();
