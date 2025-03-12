import { GetUrl } from "./utils.ts";
interface NavbarButton {
    id: string;
    label: string;
    image: string;
    getImageUrl?: () => string;
    getEnabled?: () => boolean;
    getVisible?: () => boolean;
    onAction: (control: any) => void; //todo 暂不清楚control的ts类型，有待官方给出
}

interface XMLNavbarButtons {
    [key: string]: NavbarButton;
}

export const xmlNavbarButtons: XMLNavbarButtons = {
    showMessage: {
        id: 'showMessage',
        label: '显示弹窗消息',
        image: 'images/1.svg',
        onAction: () => {
            const doc = window.Application.ActiveDocument;
            if (!doc) {
                alert('当前没有打开任何文档');
                return;
            }
            alert(doc.Name);
        }
    },
    showDialog: {
        id: 'showDialog',
        label: '显示对话框',
        image: 'images/2.svg',
        onAction: () => {
            window.Application.ShowDialog(
                GetUrl() + '/dialog',
                '这是一个对话框网页',
                400 * window.devicePixelRatio,
                400 * window.devicePixelRatio,
                false
            );
        }
    },
    showTaskPane: {
        id: 'showTaskPane',
        label: '显示任务面板',
        image: 'images/3.svg',
        onAction: () => {
            const tsId = window._Application.PluginStorage.getItem('task_pane_id');
            if (!tsId) {
                const taskPane = window._Application.CreateTaskPane(GetUrl() + '/task-pane');
                window._Application.PluginStorage.setItem('task_pane_id', taskPane.ID);
                taskPane.Visible = true;
            } else {
                const taskPane = window._Application.GetTaskPane(tsId);
                taskPane.Visible = !taskPane.Visible;
            }
        }
    },
    onNewDocumentEvent: {
        id: 'onNewDocumentEvent',
        label: '动态监听新建文件',
        image: 'images/newFormTemp.svg',
        onAction: () => {
            const bFlag = window._Application.PluginStorage.getItem('ApiEventFlag');
            const bRegister = !bFlag;
            window._Application.PluginStorage.setItem('ApiEventFlag', bRegister);
            if (bRegister) {
                window._Application.ApiEvent.AddApiEventListener('DocumentNew', 'ribbon.OnNewDocumentApiEvent');
            } else {
                window._Application.ApiEvent.RemoveApiEventListener('DocumentNew', 'ribbon.OnNewDocumentApiEvent');
            }
            window._Application.ribbonUI.InvalidateControl('btnApiEvent');
        }
    }
};

export const xmlNavbarButtonsArr = Object.keys(xmlNavbarButtons).map(key=>xmlNavbarButtons[key]);