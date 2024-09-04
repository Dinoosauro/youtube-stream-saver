(async () => {
    /**
     * The browser interface to use
     * @type chrome
     */
    const browserToUse = typeof chrome === "undefined" ? browser : chrome;
    /**
     * A list of the available codecs. It's composed by a "type" key, with a string[] that contains [the mimetype, and the string to show]; and by a "containers" key, with a string[][] that contains [["the mimetype of the container", "the name of the container to show"]]
     */
    let codecs = [];
    /**
     * The Select where the user can choose the codec option
     * @type HTMLSelectElement
    */
    const select = document.getElementById("resolution");
    /**
     * The Select where the user can choose the container of the output file
     * @type HTMLSelectElement
    */
    const container = document.getElementById("container");
    /**
     * The string of the output codec chosen
     */
    let outputCodec = "";
    const ids = await browserToUse.tabs.query({ active: true });
    /**
     * If Settings are being restored. This is used so that the value of the container won't be updated every time from the Settings
     */
    let settingsRestore = true;
    select.onchange = () => {
        container.innerHTML = "";
        browserToUse.storage.sync.set({ availableMetadataIndex: select.value });
        if (select.value === "-1") { // The default mimetype
            browserToUse.tabs.sendMessage(ids[0].id, { action: "updateFields", content: { mimeType: null } })
            return;
        }
        for (const [containerType, containerName] of codecs[+select.value].containers) {
            const option = document.createElement("option");
            option.textContent = containerName;
            option.value = containerType;
            container.append(option);
        }
        if (settingsRestore) {
            container.value = syncProperties.chosenContainer.toString();
            settingsRestore = false;
        }
        container.dispatchEvent(new Event("change"));
    }
    container.onchange = () => {
        outputCodec = codecs[+select.value].type[0].replace("$container", container.value);
        browserToUse.tabs.sendMessage(ids[0].id, { action: "updateFields", content: { mimeType: outputCodec } });
        browserToUse.storage.sync.set({ chosenContainer: container.value });
    }
    browserToUse.runtime.onMessage.addListener((msg) => {
        switch (msg.action) {
            case "running":
                for (const item of document.querySelectorAll("[data-result-show]")) {
                    const type = item.getAttribute("data-result-show")
                    item.style.display = (msg.content && type === "1") || (!msg.content && type === "0") ? "block" : "none";
                }
                break;
            case "getAvailableCodecs":
                codecs = msg.content;
                select.innerHTML = "";
                msg.content.forEach(({ type }, i) => { // Create an option for every available codec
                    const option = document.createElement("option");
                    option.textContent = type[1];
                    option.value = i;
                    select.append(option);
                });
                select.value = syncProperties.availableMetadataIndex;
                select.dispatchEvent(new Event("change"));
                break;
        }
    });
    document.getElementById("start").onclick = () => browserToUse.tabs.sendMessage(ids[0].id, { action: "start" });
    document.getElementById("stop").onclick = () => browserToUse.tabs.sendMessage(ids[0].id, { action: "stop" });
    const syncProperties = await browserToUse.storage.sync.get(["availableMetadataIndex", "chosenContainer", ...Array.from(document.querySelectorAll("[data-settings]")).map(item => item.getAttribute("data-settings"))]); // The first two properties contain the value of the two selects.
    for (const item of document.querySelectorAll("[data-settings]")) {
        const prop = item.getAttribute("data-settings");
        item.value = syncProperties[prop] ?? item.getAttribute("data-default-value");
        item.addEventListener("change", () => {
            browserToUse.storage.sync.set({ [prop]: item.value });
            browserToUse.tabs.sendMessage(ids[0].id, { action: "updateFields", content: { [prop]: item.value } })
        });
    }
    document.getElementById("grantAccess").onclick = async () => { // Request the access to the YouTube webpage
        await browserToUse.permissions.request({ origins: ["https://*.youtube.com/*"] });
        checkPermission();
    }
    async function checkPermission() { // Check if the user has granted permission to the extension to access the YouTube webpage, so that, if false, a warning on the extension UI will be shown.
        document.getElementById("requireAccess").style.display = await browserToUse.permissions.contains({ origins: ["https://*.youtube.com/*"] }) ? "none" : "block";
    }
    checkPermission();
    browserToUse.tabs.sendMessage(ids[0].id, { action: "running" });
    browserToUse.tabs.sendMessage(ids[0].id, { action: "getAvailableCodecs" });
})();
