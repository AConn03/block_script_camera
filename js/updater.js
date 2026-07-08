let initialVersion = null;

async function checkVersion() {
    try {
        const res = await fetch(`./version.json?_nocache=${Date.now()}`);
        const data = await res.json();
        
        if (!initialVersion) {
            initialVersion = data.version; 
        } else if (data.version !== initialVersion) {
            document.getElementById('updateBanner').style.display = 'block';
        }
    } catch (e) { 
        console.log("Waiting for version file..."); 
    }
}

checkVersion();
setInterval(checkVersion, 5000);
