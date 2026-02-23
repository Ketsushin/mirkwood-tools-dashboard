import { MWD, defaultState } from "./storage.js";
import { MWD_Dashboard } from "./dashboard.js";
import { registerSceneConfigInjection } from "./scene-config.js";

Hooks.once("init", () => {
  game.settings.register(MWD.MODULE_ID, MWD.SETTINGS_KEY, {
    name: "World State",
    scope: "world",
    config: false,
    type: Object,
    default: defaultState()
  });

  game.settings.registerMenu(MWD.MODULE_ID, "dashboardMenu", {
    name: "MWD.OpenDashboard",
    label: "MWD.OpenDashboard",
    hint: "GM-Dashboard für Weltzustände, Profile und Regionen.",
    icon: "fas fa-globe",
    restricted: true,
    type: MWD_Dashboard
  });

  registerSceneConfigInjection();
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  Hooks.on("getSceneControlButtons", controls => {
    controls.push({
      name: "mwd",
      title: game.i18n.localize("MWD.SceneButton"),
      icon: "fas fa-globe-europe",
      layer: "controls",
      tools: [
        {
          name: "mwd-open",
          title: game.i18n.localize("MWD.OpenDashboard"),
          icon: "fas fa-clipboard-list",
          onClick: () => new MWD_Dashboard().render(true),
          button: true
        }
      ]
    });
  });
});

Hooks.once("setup", () => {
  game.mwd = {
    open: () => new MWD_Dashboard().render(true)
  };
});