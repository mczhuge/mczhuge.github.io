document.addEventListener('DOMContentLoaded', () => {
    const modal = document.querySelector('.modal');
    const modalContent = document.querySelector('.modal-content .modal-body');
    const closeBtn = document.querySelector('.modal-close-btn');

    modal.style.display = 'none';

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    const buttons = document.querySelectorAll('.hex-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            setTimeout(() => {
                const buttonText = button.innerText.trim().toLowerCase();
                let page = '';

                if (buttonText === 'about') page = 'about';
                if (buttonText === 'research') page = 'research';
                if (buttonText === 'hiring') page = 'hiring';

                if (page) {
                    loadContent(page);
                }
            }, 100);
        });
    });

    function loadContent(pageName) {
        fetch(`partials/${pageName}.html`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${pageName}: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                modalContent.innerHTML = html;
                modal.style.display = 'flex';
            })
            .catch(err => {
                console.error(err);
                modalContent.innerHTML = `<p style="color:red;">Could not load ${pageName} content.</p>`;
                modal.style.display = 'flex';
            });
    }
});
