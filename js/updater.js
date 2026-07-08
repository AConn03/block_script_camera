let initialVersion = null;

async function checkVersion() {
    try {
        const res = await fetch(`./version.json?_nocache=${Date.now()}`);
        const data = await res.json();
        
        if (!initialVersion) {
            initialVersion = data.version; 
        } else if (data.version !== initialVersion) {
            const banner = document.getElementById('updateBanner');
            if (banner) {
                const updateMessage = data.title ? `Update Available: ${data.title}` : 'Update is Available';
                banner.textContent = `${updateMessage} (Click to reload)`;
                banner.style.display = 'block';
            }
        }
    } catch (e) { 
        console.log("Waiting for version file..."); 
    }
}

checkVersion();
setInterval(checkVersion, 5000);
