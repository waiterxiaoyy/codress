import path from "node:path";
import { Menu, Tray, nativeImage, app } from "electron";
import { adapters } from "./adapters";
import type { AppContext } from "./context";

/** 系统托盘 / 菜单栏:一键暂停、恢复、隐藏宠物。 */
export function createTray(
  ctx: AppContext,
  resourcesRoot: string,
  showMainWindow: () => void
): Tray {
  let icon = nativeImage.createFromPath(path.join(resourcesRoot, "icon.png"));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(resourcesRoot, "icon.jpg"));
  if (!icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip("Codress");

  const rebuild = () => {
    const settings = ctx.settings.get();
    const template: Electron.MenuItemConstructorOptions[] = [
      { label: "打开 Codress", click: showMainWindow },
      { type: "separator" },
    ];
    for (const adapter of Object.values(adapters)) {
      const active = settings.activeSkins[adapter.id];
      template.push({
        label: `${adapter.name}${active ? ` · ${active}` : ""}`,
        submenu: [
          {
            label: "暂停皮肤",
            enabled: Boolean(active),
            click: () => void ctx.pauseSkin(adapter.id),
          },
          {
            label: "恢复皮肤",
            enabled: Boolean(active),
            click: () => void ctx.resumeSkin(adapter.id),
          },
          {
            label: "恢复默认外观",
            enabled: Boolean(active),
            click: () => void ctx.restoreSkin(adapter.id),
          },
        ],
      });
    }
    template.push(
      { type: "separator" },
      {
        label: "隐藏宠物",
        enabled: Boolean(settings.activePet),
        click: () => void ctx.setPet(null),
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() }
    );
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };

  rebuild();
  ctx.on("status", rebuild);
  tray.on("click", showMainWindow);
  return tray;
}
