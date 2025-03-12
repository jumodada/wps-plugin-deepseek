import {xmlNavbarButtons,xmlNavbarButtonsArr} from "./config.ts";

function OnNewDocumentApiEvent(doc: any): void {
  alert('新建文件事件响应，取文件名: ' + doc.Name);
}

function getConfig(control: any) {
  return  xmlNavbarButtonsArr.find(c => c.id === control.Id)
}

// 这些函数是给wps客户端调用的
export default {
  OnAddinLoad(ribbonUI: any): boolean {
    if (typeof window._Application.ribbonUI != 'object') {
      window._Application.ribbonUI = ribbonUI;
    }

    // 做一些初始化操作，例如设置一些Storage的初始数据
    window._Application.PluginStorage.setItem('EnableFlag', false);
    return true;
  },
  OnAction(control: any){
    xmlNavbarButtons[control.Id].onAction(control);
  },
  GetImage(control){
    const config = getConfig(control);
    return config?.getImageUrl?.();
  },
  OnGetEnabled(control: any): boolean {
    const config = getConfig(control);
    return config?.getEnabled ? config?.getEnabled?.() : true;
  },
  OnGetVisible(control: any){
    const config = getConfig(control);
    return config?.getVisible?.();
  },
  OnGetLabel(control: any){
    const config = getConfig(control);
    return config?.label;
  },
  OnNewDocumentApiEvent
}; 