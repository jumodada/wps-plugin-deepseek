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
    }
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

export {};