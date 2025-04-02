function GetUrlPath() {
    // 在本地网页的情况下获取路径
    if (window.location.protocol === 'file:') {
        const path = window.location.href;
        // 删除文件名以获取根路径
        return path.substring(0, path.lastIndexOf('/'));
    }

    // 在非本地网页的情况下获取根路径
    const { protocol, hostname, port } = window.location;
    const portPart = port ? `:${port}` : '';
    return `${protocol}//${hostname}${portPart}`;
}

function GetRouterHash() {
    if (window.location.protocol === 'file:') {
        return '';
    }

    return '/#'
}

function GetUrl() {
    return GetUrlPath() + GetRouterHash();
}

// 关闭所有任务面板
function closeAllTaskPanes() {
    const paneIds = ['all_article_pane_id', 'task_pane_id', 'selection_pane_id'];
    paneIds.forEach(id => {
        const tsId = window.Application.PluginStorage.getItem(id);
        if (tsId) {
            try {
                const taskPane = window.Application.GetTaskPane(tsId);
                if (taskPane && taskPane.Visible) {
                    taskPane.Visible = false;
                }
            } catch (error) {
                console.error(`关闭面板${id}失败:`, error);
            }
        }
    });
}

const xmlNavbarButtons = {
    allArticleOptimization: {
        id: 'allArticleOptimization',
        label: '文档预览',
        image: 'images/1.svg',
        onAction: () => {
            const tsId = window.Application.PluginStorage.getItem('all_article_pane_id');
            if (!tsId) {
                closeAllTaskPanes();
                const taskPane = window.Application.CreateTaskPane(GetUrlPath() + '/all-article-optimization');
                window.Application.PluginStorage.setItem('all_article_pane_id', taskPane.ID);
                taskPane.Visible = true;
            } else {
                const taskPane = window.Application.GetTaskPane(tsId);
                if (taskPane.Visible) {
                    taskPane.Visible = false;
                } else {
                    closeAllTaskPanes();
                    taskPane.Visible = true;
                }
            }
        }
    },
    articleOptimization: {
        id: 'articleOptimization',
        label: '文章优化',
        image: 'images/1.svg',
        onAction: () => {
            const tsId = window.Application.PluginStorage.getItem('task_pane_id');
            if (!tsId) {
                closeAllTaskPanes();
                const taskPane = window.Application.CreateTaskPane(GetUrlPath() + GetRouterHash() + '/article-optimization');
                window.Application.PluginStorage.setItem('task_pane_id', taskPane.ID);
                taskPane.Visible = true;
            } else {
                const taskPane = window.Application.GetTaskPane(tsId);
                if (taskPane.Visible) {
                    taskPane.Visible = false;
                } else {
                    closeAllTaskPanes();
                    taskPane.Visible = true;
                }
            }
        }
    },
    selectionOptimization:{
        id: 'selectionOptimization',
        label: '段落优化',
        image: 'images/1.svg',
        onAction: () => {
            try {
                const selection = window.Application.Selection;
                if (!selection || selection.Text.trim() === '') {
                    alert('请先选择需要优化的段落');
                    return;
                }
                
                // 有选中文本，打开段落优化面板
                const tsId = window.Application.PluginStorage.getItem('selection_pane_id');
                if (!tsId) {
                    closeAllTaskPanes();
                    const taskPane = window.Application.CreateTaskPane(GetUrlPath() + GetRouterHash() + '/selection-optimization');
                    window.Application.PluginStorage.setItem('selection_pane_id', taskPane.ID);
                    taskPane.Visible = true;
                } else {
                    const taskPane = window.Application.GetTaskPane(tsId);
                    if (taskPane.Visible) {
                        taskPane.Visible = false;
                    } else {
                        closeAllTaskPanes();
                        taskPane.Visible = true;
                    }
                }
            } catch (error) {
                alert('无法获取选中内容，请重试');
            }
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
            const tsId = window.Application.PluginStorage.getItem('task_pane_id');
            if (!tsId) {
                closeAllTaskPanes();
                const taskPane = window.Application.CreateTaskPane(GetUrlPath() + GetRouterHash() + '/task-pane');
                window.Application.PluginStorage.setItem('task_pane_id', taskPane.ID);
                taskPane.Visible = true;
            } else {
                const taskPane = window.Application.GetTaskPane(tsId);
                if (taskPane.Visible) {
                    taskPane.Visible = false;
                } else {
                    closeAllTaskPanes();
                    taskPane.Visible = true;
                }
            }
        }
    },
    onNewDocumentEvent: {
        id: 'onNewDocumentEvent',
        label: '动态监听新建文件',
        image: 'images/newFormTemp.svg',
        onAction: () => {
            const bFlag = window.Application.PluginStorage.getItem('ApiEventFlag');
            const bRegister = !bFlag;
            window.Application.PluginStorage.setItem('ApiEventFlag', bRegister);
            if (bRegister) {
                window.Application.ApiEvent.AddApiEventListener('DocumentNew', 'ribbon.OnNewDocumentApiEvent');
            } else {
                window.Application.ApiEvent.RemoveApiEventListener('DocumentNew', 'ribbon.OnNewDocumentApiEvent');
            }
            window.Application.ribbonUI.InvalidateControl('btnApiEvent');
        }
    }
};

const xmlNavbarButtonsArr = Object.keys(xmlNavbarButtons).map(key => xmlNavbarButtons[key]);

function OnNewDocumentApiEvent(doc) {
  alert('新建文件事件响应，取文件名: ' + doc.Name);
}

function getConfig(control) {
  return xmlNavbarButtonsArr.find(c => c.id === control.Id)
}

//在后续的wps版本中，wps的所有枚举值都会通过wps.Enum对象来自动支持，现阶段先人工定义
const WPS_Enum = {
  msoCTPDockPositionLeft: 0,
  msoCTPDockPositionRight: 2
}

function openOfficeFileFromSystemDemo(param) {
  let jsonObj = typeof param == 'string' ? JSON.parse(param) : param
  alert('从业务系统传过来的参数为：' + JSON.stringify(jsonObj))
  return { wps加载项项返回: jsonObj.filepath + ', 这个地址给的不正确' }
}

function InvokeFromSystemDemo(param) {
  let jsonObj = typeof param == 'string' ? JSON.parse(param) : param
  let handleInfo = jsonObj.Index
  switch (handleInfo) {
    case 'getDocumentName': {
      let docName = ''
      if (window.Application.ActiveDocument) {
        docName = window.Application.ActiveDocument.Name
      }

      return { 当前打开的文件名为: docName }
    }

    case 'newDocument': {
      let newDocName = ''
      let doc = window.Application.Documents.Add()
      newDocName = doc.Name

      return { 操作结果: '新建文档成功，文档名为：' + newDocName }
    }

    case 'OpenFile': {
      let filePath = jsonObj.filepath
      window.Application.Documents.OpenFromUrl(filePath)
      return { 操作结果: '打开文件成功' }
    }
  }

  return { 其它xxx: '' }
}

// 这些函数是给wps客户端调用的
export default {
  OnAddinLoad(ribbonUI) {
    if (typeof window.Application.ribbonUI != 'object') {
      window.Application.ribbonUI = ribbonUI
    }
    if (typeof window.Application.Enum != 'object') {
      // 如果没有内置枚举值
      window.Application.Enum = WPS_Enum
    }
  
    window.openOfficeFileFromSystemDemo = openOfficeFileFromSystemDemo
    window.InvokeFromSystemDemo = InvokeFromSystemDemo
  
    window.Application.PluginStorage.setItem('EnableFlag', false) //往PluginStorage中设置一个标记，用于控制两个按钮的置灰
    window.Application.PluginStorage.setItem('ApiEventFlag', false) //往PluginStorage中设置一个标记，用于控制ApiEvent的按钮label
    window.Application = window.Application;
    return true
  },
  OnAction(control) {
    xmlNavbarButtons[control.Id].onAction(control);
  },
  GetImage(control) {
    const config = getConfig(control);
    return config?.getImageUrl?.();
  },
  OnGetEnabled(control) {
    const config = getConfig(control);
    return config?.getEnabled ? config?.getEnabled?.() : true;
  },
  OnGetVisible(control) {
    const config = getConfig(control);
    return config?.getVisible?.();
  },
  OnGetLabel(control) {
    const config = getConfig(control);
    return config?.label;
  },
  OnNewDocumentApiEvent
}
