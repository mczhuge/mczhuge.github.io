document.addEventListener('DOMContentLoaded', () => {
    const modal = document.querySelector('.modal');
    const modalContent = document.querySelector('.modal-content .modal-body');
    const closeBtn = document.querySelector('.modal-close-btn');

    // 确保弹窗初始是隐藏的
    modal.style.display = 'none';

    // 关闭弹窗的逻辑
    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // 针对三个按钮添加监听事件，不改变原本 onclick，只是在 alert 后执行
    const buttons = document.querySelectorAll('.hex-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            setTimeout(() => {
                const buttonText = button.innerText.trim().toLowerCase();
                let page = '';

                // 根据按钮文字确定加载的页面
                if (buttonText === 'about') page = 'about';
                if (buttonText === 'research') page = 'research';
                if (buttonText === 'hiring') page = 'hiring';

                if (page) {
                    loadContent(page); // 点击按钮后才加载内容并显示弹窗
                }
            }, 100); // 确保在 alert 关闭后执行
        });
    });

    // 加载页面内容的函数
    function loadContent(pageName) {
        fetch(`partials/${pageName}.html`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${pageName}: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                modalContent.innerHTML = html; // 插入内容
                modal.style.display = 'flex'; // 显示弹窗
            })
            .catch(err => {
                console.error(err);
                modalContent.innerHTML = `<p style="color:red;">Could not load ${pageName} content.</p>`;
                modal.style.display = 'flex'; // 显示错误信息
            });
    }
});
