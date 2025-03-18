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
    return  GetUrlPath() + GetRouterHash();
}

function OpenDialog(title: string, width?: number, height?: number) {
    const dialogUrl = `${GetUrl()}/dialog`;
    return window._Application.ShowDialog(
        dialogUrl,  
        title,
        width || 400 * window.devicePixelRatio,
        height || 400 * window.devicePixelRatio,
        false
    );
}

export {
    GetUrlPath,
    GetRouterHash,
    GetUrl,
    OpenDialog
}
