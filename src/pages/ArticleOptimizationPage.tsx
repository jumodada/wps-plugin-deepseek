import { Button, Card } from 'antd';

const ArticleOptimizationPage = () => {
    const handleOptimizeAll = () => {
        console.log(window._Application.ActiveDocument.WordOpenXML)
    }
    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'start', height: '100vh' }}>
            <Card title="段落优化" style={{ marginBottom: '20px' }}>
                <p>选择需要优化的段落，点击按钮即可智能优化文章表达</p>
                <Button 
                    type="primary" 
                    onClick={handleOptimizeAll}
                >
                    优化选中段落
                </Button>
            </Card>
            <Card title="全文优化">
                <p>一键优化全文内容，提升文章整体质量</p>
                <Button 
                    onClick={handleOptimizeAll} 
                    type="primary" 
                >
                    一键优化全文
                </Button>
            </Card>
        </div>
    );
};

export default ArticleOptimizationPage; 