import { MWD, getState, setState, defaultProfile, randomID, clampNumber, findActiveProfile } from "./storage.js";
import { computeDerived } from "./calc.js";

export class MWD_Dashboard extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "mwd-dashboard",
      title: game.i18n.localize("MWD.ModuleName"),
      template: `modules/${MWD.MODULE_ID}/templates/dashboard.hbs`,
      width: 980,
      height: 760,
      resizable: true,
      classes: ["mwd-app"]
    });
  }

  constructor(...args) {
    super(...args);
    this._state = null;
    this._activeRegionId = null;
  }

  async getData() {
    this._state = await getState();
    const active = findActiveProfile(this._state);

    // ensure active region selection
    if (!this._activeRegionId || !active.regions.some(r => r.id === this._activeRegionId)) {
      this._activeRegionId = active.regions?.[0]?.id ?? null;
    }
    const activeRegion = active.regions.find(r => r.id === this._activeRegionId) ?? null;

    const profiles = this._state.profiles.map(p => ({
      id: p.id,
      name: p.name,
      isActive: p.id === this._state.activeProfileId
    }));

    // decorate regions
    active.regions = active.regions.map(r => ({ ...r, isActive: r.id === this._activeRegionId }));

    const derived = activeRegion ? computeDerived({ profile: active, region: activeRegion }) : null;

    return {
      profiles,
      active,
      activeRegion,
      derived: derived
        ? {
            priceLabel: `${Math.round(derived.pricePct)}%`,
            availLabel: `${Math.round(derived.availability)}%`,
            smuggleLabel: `${Math.round(derived.smuggle)}%`,
            detectLabel: `${Math.round(derived.detect)}%`,
            attitudeLabel: derived.attitudeLabel,
            attitudeClass: derived.attitudeClass,
            attitudeReason: derived.reason
          }
        : null
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-region-id]").on("click", ev => {
      const rid = ev.currentTarget.dataset.regionId;
      this._activeRegionId = rid;
      this.render();
    });

    html.find("[data-action]").on("click", ev => this._onAction(ev));
  }

  async _onAction(ev) {
    const action = ev.currentTarget.dataset.action;
    const state = await getState();

    const active = findActiveProfile(state);

    if (action === "newProfile") {
      const name = await Dialog.prompt({
        title: game.i18n.localize("MWD.NewProfile"),
        content: `<p>Name des Profils:</p><input type="text" name="name" value="Neues Profil"/>`,
        label: game.i18n.localize("MWD.Save"),
        callback: html => html.find('input[name="name"]').val()
      });
      const p = defaultProfile(String(name || "Neues Profil"));
      state.profiles.push(p);
      state.activeProfileId = p.id;
      await setState(state);
      this._activeRegionId = p.regions[0].id;
      return this.render();
    }

    if (action === "duplicateProfile") {
      const copy = foundry.utils.deepClone(active);
      copy.id = randomID();
      copy.name = `${active.name} (Copy)`;
      copy.regions = copy.regions.map(r => ({ ...r, id: randomID() }));
      state.profiles.push(copy);
      state.activeProfileId = copy.id;
      await setState(state);
      this._activeRegionId = copy.regions[0].id;
      return this.render();
    }

    if (action === "renameProfile") {
      const name = await Dialog.prompt({
        title: game.i18n.localize("MWD.RenameProfile"),
        content: `<p>Neuer Name:</p><input type="text" name="name" value="${foundry.utils.escapeHTML(active.name)}"/>`,
        label: game.i18n.localize("MWD.Save"),
        callback: html => html.find('input[name="name"]').val()
      });
      active.name = String(name || active.name);
      await setState(state);
      return this.render();
    }

    if (action === "deleteProfile") {
      if (state.profiles.length <= 1) {
        ui.notifications.warn("Mindestens ein Profil muss existieren.");
        return;
      }
      const yes = await Dialog.confirm({
        title: game.i18n.localize("MWD.DeleteProfile"),
        content: `<p>Profil "${foundry.utils.escapeHTML(active.name)}" wirklich löschen?</p>`
      });
      if (!yes) return;

      const idx = state.profiles.findIndex(p => p.id === active.id);
      state.profiles.splice(idx, 1);
      state.activeProfileId = state.profiles[0].id;
      await setState(state);
      this._activeRegionId = findActiveProfile(state).regions[0].id;
      return this.render();
    }

    if (action === "addRegion") {
      active.regions.push({
        id: randomID(),
        name: "Neue Region",
        danger: 2,
        unrest: 2,
        supply: 3,
        notes: ""
      });
      await setState(state);
      this._activeRegionId = active.regions[active.regions.length - 1].id;
      return this.render();
    }

    if (action === "removeRegion") {
      const rid = this._activeRegionId;
      if (!rid) return;

      if (active.regions.length <= 1) {
        ui.notifications.warn("Mindestens eine Region muss existieren.");
        return;
      }
      const region = active.regions.find(r => r.id === rid);
      const yes = await Dialog.confirm({
        title: game.i18n.localize("MWD.RemoveRegion"),
        content: `<p>Region "${foundry.utils.escapeHTML(region?.name ?? "")}" entfernen?</p>`
      });
      if (!yes) return;

      active.regions = active.regions.filter(r => r.id !== rid);
      await setState(state);
      this._activeRegionId = active.regions[0].id;
      return this.render();
    }

    if (action === "export") {
      const payload = await getState();
      const fileName = `mwd-worldstate-${game.world.id}.json`;
      saveDataToFile(JSON.stringify(payload, null, 2), "application/json", fileName);
      return;
    }

    if (action === "import") {
      const picked = await FilePicker.browse("data", "", { wildcard: true });
      const content = await Dialog.prompt({
        title: game.i18n.localize("MWD.Import"),
        content: `
          <p>Importiere JSON:</p>
          <p class="mwd-small">Tipp: Lege die Datei in Data/ oder kopiere JSON in das Feld.</p>
          <textarea name="json" rows="12" style="width:100%"></textarea>
        `,
        label: game.i18n.localize("MWD.Save"),
        callback: html => html.find('textarea[name="json"]').val()
      });

      try {
        const parsed = JSON.parse(content);
        if (!parsed?.profiles?.length) throw new Error("Ungültiges Format.");
        await setState(parsed);
        ui.notifications.info("Import erfolgreich.");
        this._activeRegionId = findActiveProfile(parsed).regions[0].id;
        return this.render();
      } catch (e) {
        console.error(e);
        ui.notifications.error(`Import fehlgeschlagen: ${e.message}`);
      }
      return;
    }

    if (action === "assignScene") {
      const scene = game.scenes.current;
      if (!scene) return;
      await scene.setFlag(MWD.MODULE_ID, "profileId", state.activeProfileId);
      ui.notifications.info(`Profil "${active.name}" der Szene zugewiesen.`);
      return;
    }

    if (action === "clearScene") {
      const scene = game.scenes.current;
      if (!scene) return;
      await scene.unsetFlag(MWD.MODULE_ID, "profileId");
      ui.notifications.info("Szenen-Zuweisung entfernt.");
      return;
    }
  }

  async _updateObject(_event, formData) {
    const state = await getState();

    // active profile id (dropdown)
    const newActiveId = formData["activeProfileId"];
    if (newActiveId && state.profiles.some(p => p.id === newActiveId)) {
      state.activeProfileId = newActiveId;
    }

    const active = findActiveProfile(state);

    // globals
    active.globals.shadow = clampNumber(formData["globals.shadow"], 0, 10, active.globals.shadow);
    active.globals.war = clampNumber(formData["globals.war"], 0, 5, active.globals.war);

    // params
    for (const key of Object.keys(active.params)) {
      const path = `params.${key}`;
      if (formData[path] !== undefined) active.params[key] = Number(formData[path]);
    }

    // region edits
    const rid = this._activeRegionId;
    const region = active.regions.find(r => r.id === rid);
    if (region) {
      if (formData["region.name"] !== undefined) region.name = String(formData["region.name"]);
      if (formData["region.danger"] !== undefined) region.danger = clampNumber(formData["region.danger"], 0, 5, region.danger);
      if (formData["region.unrest"] !== undefined) region.unrest = clampNumber(formData["region.unrest"], 0, 5, region.unrest);
      if (formData["region.supply"] !== undefined) region.supply = clampNumber(formData["region.supply"], 0, 5, region.supply);
      if (formData["region.notes"] !== undefined) region.notes = String(formData["region.notes"]);
    }

    await setState(state);

    // If user switched active profile, ensure region selection exists
    const nowActive = findActiveProfile(state);
    if (!nowActive.regions.some(r => r.id === this._activeRegionId)) {
      this._activeRegionId = nowActive.regions?.[0]?.id ?? null;
    }

    this.render();
  }
}