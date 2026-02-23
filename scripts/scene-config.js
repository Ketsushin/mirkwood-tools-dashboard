import { MWD, getState } from "./storage.js";

export function registerSceneConfigInjection() {
  Hooks.on("renderSceneConfig", async (app, html) => {
    if (!game.user.isGM) return;

    const state = await getState();
    const profiles = state.profiles ?? [];

    const current = app.document.getFlag(MWD.MODULE_ID, "profileId") ?? "";

    const options = [
      `<option value="">(keins)</option>`,
      ...profiles.map(p => `<option value="${p.id}" ${p.id === current ? "selected" : ""}>${foundry.utils.escapeHTML(p.name)}</option>`)
    ].join("");

    const block = $(`
      <div class="form-group">
        <label>${game.i18n.localize("MWD.SceneProfile")}</label>
        <div class="form-fields">
          <select name="flags.${MWD.MODULE_ID}.profileId">
            ${options}
          </select>
        </div>
        <p class="hint">${game.i18n.localize("MWD.SceneProfileHint")}</p>
      </div>
    `);

    html.find('div.tab[data-tab="basic"] .form-group').last().after(block);
  });

  // auto-switch profile when scene becomes active
  Hooks.on("canvasReady", async () => {
    if (!game.user.isGM) return;
    const scene = game.scenes.current;
    if (!scene) return;

    const pid = scene.getFlag(MWD.MODULE_ID, "profileId");
    if (!pid) return;

    const state = await getState();
    if (state.activeProfileId !== pid && state.profiles.some(p => p.id === pid)) {
      state.activeProfileId = pid;
      await game.settings.set(MWD.MODULE_ID, MWD.SETTINGS_KEY, state);
      ui.notifications.info(`MWD: Profil gewechselt (Scene)`);
    }
  });
}