/// <reference types="wps-jsapi-declare" />

declare global {
    declare namespace WPS {
        interface Document {
            Name: string;
            Range(start: number, end: number): Range;
            Close(): void;
        }
    
        interface Range {
            Text: string;
            Select(): void;
        }
    
        interface TaskPane {
            ID: string;
            Visible: boolean;
            DockPosition: number;
        }
    }
    interface Window {
        _Application: import('wps-jsapi-declare').WpsApplication;
        ribbon: typeof import('../wpsjs').default;
        openOfficeFileFromSystemDemo: any
        InvokeFromSystemDemo: any
        Application: import('wps-jsapi-declare').WpsApplication;
    }
    type  WpsApplication = import('wps-jsapi-declare').WpsApplicationc
}

declare module '@/wpsjs/tool/util' {
  export const WPS_Enum: any;
  export function GetUrlPath(): string;
  export function GetRouterHash(): string;
}

declare module '@/wpsjs/tool/systemdemo' {
  const SystemDemo: {
    openOfficeFileFromSystemDemo: any;
    InvokeFromSystemDemo: any;
  };
  export default SystemDemo;
}

declare module 'wps-jsapi-declare' {
    export = WpsApplication;
}

export {WpsApplication};

declare interface WpsApplication {
    ActiveDocument: {
        WordOpenXML: string;
        // 可以根据需要添加其他属性和方法
    };
    // 其他WPS API成员...
}