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
      classes: ["mwd-app"],
      closeOnSubmit: false // <<< wichtig: Fenster bleibt offen
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

    if (!this._activeRegionId || !active.regions.some(r => r.id === this._activeRegionId)) {
      this._activeRegionId = active.regions?.[0]?.id ?? null;
    }
    const activeRegion = active.regions.find(r => r.id === this._activeRegionId) ?? null;

    const profiles = this._state.profiles.map(p => ({
      id: p.id,
      name: p.name,
      isActive: p.id === this._state.activeProfileId
    }));

    active.regions = active.regions.map(r => ({ ...r, isActive: r.id === this._activeRegionId }));

    const derivedRaw = activeRegion ? computeDerived({ profile: active, region: activeRegion }) : null;

    const derived = derivedRaw
      ? {
          marketLabel: `${Math.round(derivedRaw.marketPct)}%`,
          buyFactorLabel: `${derivedRaw.buyFactor.toFixed(2)}×`,
          sellLabel: `${Math.round(derivedRaw.sellFactor * 100)}% vom Basispreis`,
          sellFactorLabel: `${derivedRaw.sellFactor.toFixed(2)}×`,
          availLabel: `${Math.round(derivedRaw.availability)}%`,
          smuggleLabel: `${Math.round(derivedRaw.smuggle)}%`,
          detectLabel: `${Math.round(derivedRaw.detect)}%`,
          attitudeLabel: derivedRaw.attitudeLabel,
          attitudeClass: derivedRaw.attitudeClass,
          attitudeReason: derivedRaw.reason
        }
      : null;

    return { profiles, active, activeRegion, derived };
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
      return this._showImportDialog();
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

  async _showImportDialog() {
    const content = `
      <p>JSON Import:</p>
      <div class="form-group">
        <label>Datei auswählen</label>
        <div class="form-fields">
          <input type="file" name="jsonfile" accept="application/json"/>
        </div>
        <p class="hint">Empfohlen: Datei auswählen. Alternativ kannst du JSON unten einfügen.</p>
      </div>
      <div class="form-group">
        <label>Oder JSON einfügen</label>
        <textarea name="jsontext" rows="10" style="width:100%"></textarea>
      </div>
    `;

    return new Promise(resolve => {
      new Dialog({
        title: game.i18n.localize("MWD.Import"),
        content,
        buttons: {
          import: {
            label: game.i18n.localize("MWD.Save"),
            callback: async html => {
              try {
                const fileInput = html.find('input[name="jsonfile"]')[0];
                const textAreaVal = String(html.find('textarea[name="jsontext"]').val() ?? "").trim();

                let jsonString = "";

                if (fileInput?.files?.length) {
                  jsonString = await readFileAsText(fileInput.files[0]);
                } else if (textAreaVal.length) {
                  jsonString = textAreaVal;
                } else {
                  throw new Error("Keine Datei gewählt und kein JSON eingefügt.");
                }

                const parsed = JSON.parse(jsonString);
                if (!parsed?.profiles?.length) throw new Error("Ungültiges Format (profiles fehlt).");

                await setState(parsed);
                ui.notifications.info("Import erfolgreich.");

                // region selection neu setzen
                const active = findActiveProfile(parsed);
                this._activeRegionId = active.regions?.[0]?.id ?? null;

                this.render();
              } catch (e) {
                console.error(e);
                ui.notifications.error(`Import fehlgeschlagen: ${e.message}`);
              }
              resolve();
            }
          },
          cancel: { label: game.i18n.localize("MWD.Cancel"), callback: () => resolve() }
        },
        default: "import"
      }).render(true);
    });
  }

  async _updateObject(_event, formData) {
    const state = await getState();

    const newActiveId = formData["activeProfileId"];
    if (newActiveId && state.profiles.some(p => p.id === newActiveId)) {
      state.activeProfileId = newActiveId;
    }

    const active = findActiveProfile(state);

    active.globals.shadow = clampNumber(formData["globals.shadow"], 0, 10, active.globals.shadow);
    active.globals.war = clampNumber(formData["globals.war"], 0, 5, active.globals.war);

    for (const key of Object.keys(active.params)) {
      const path = `params.${key}`;
      if (formData[path] !== undefined) active.params[key] = Number(formData[path]);
    }

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

    const nowActive = findActiveProfile(state);
    if (!nowActive.regions.some(r => r.id === this._activeRegionId)) {
      this._activeRegionId = nowActive.regions?.[0]?.id ?? null;
    }

    // bleibt offen und rendert neu
    this.render();
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}