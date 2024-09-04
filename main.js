/**
 * The extension object
 * @type chrome
 */
const browserToUse = typeof chrome === "undefined" ? browser : chrome;
let settings = {
    audioBitsPerSecond: 192_000,
    videoBitsPerSecond: 2_500_000,
    mimeType: null,
    videoKeyFrameIntervalDuration: 5
}
/**
 * 
 * @returns An array of the available codecs. Each array has a "type" key, with its value as a [string with the mimetype to replace, string with the name to show in the UI] and "containers" object, with a string[][] composed of [[the container mimetype, the name to show]]
 */
function checkAvailableMimetypes() {
    const codecs = {
        video: [["vp9", "VP9 Video"], ["avc1", "H264 Video"], ["vp8", "VP8 Video"], ["av1", "AV1 Video"], ["hev1", "H265 Video"], ["", ""]],
        audio: [["opus", "Opus Audio"], ["pcm", "PCM Audio"], ["mp4a", "AAC Audio"], [""]],
        container: [["webm", "WebM"], ["ogg", "OGG"], ["mp4", "MP4"], ["x-matroska", "Matroska"]]
    }
    const output = [];
    for (const [video, videoDesc] of codecs.video) {
        for (const [audio, audioDesc] of codecs.audio) {
            if (video === "" && audio === "") continue;
            for (const container of codecs.container) {
                const stringToTest = `${video === "" ? "audio" : "video"}/${container[0]}; codecs=${video === "" ? "" : `"${video}"`}${video !== "" && audio !== "" ? "," : ""}${audio === "" ? "" : `"${audio}"`}`
                if (MediaRecorder.isTypeSupported(stringToTest)) {
                    const generalString = stringToTest.replace(container[0], "$container");;
                    const index = output.findIndex(field => field.type[0] === generalString);
                    if (index !== -1) output[index].containers.push(container); else output.push({ type: [generalString, `${video === "" ? "" : videoDesc}${video !== "" && audio !== "" ? " + " : ""}${audio === "" ? "" : audioDesc}`], containers: [container] });
                }
            }
        }
    }
    return output;
}
/**
 * The object used for recording the video stream
 * @type MediaRecorder
 */
let mediaRecorder = null;
/**
 * The chunks of the recorded video. Note that nothing is added if the File System API is used.
 */
let chunks = [];
/**
 * The name of the output file
 */
let suggestedName = crypto?.randomUUID() ?? Math.random();
/**
 * The Writable of the file the user has selected. This is only used for the File System API
 * @type FileSystemWritableFileStream
 */
let fileWritable;
/**
 * The position where the new chunk should be written
 */
let writePosition = 0;
/**
 * Stop the recording. This is used so that, if the source changes, the recording of the new source will be started automatically.
 */
let forceStop = false;
/**
 * The main function, that starts the recording of the video
 */
async function startContent() {
    const video = document.querySelector("video");
    /**
     * The extension of the output file (without the dot)
     */
    const extension = (settings.mimeType ? settings.mimeType.substring(settings.mimeType.indexOf("/") + 1, settings.mimeType.indexOf(";")) : checkAvailableMimetypes()[0].containers[0][1]).replace("x-matroska", "mkv");
    video.addEventListener("ended", () => {
        mediaRecorder.stop();
    });
    const [title, channel, id, channelLink] = [document.querySelector("#title > h1 > yt-formatted-string")?.textContent, document.querySelector("#upload-info > #channel-name a")?.textContent, new URLSearchParams(window.location.search).get("v"), document.querySelector("#upload-info > #channel-name a").href]
    if (title && channel && id) suggestedName = `${title} [${id}]`;
    forceStop = false;
    if (video !== null) { // Start the cappture
        const stream = typeof video.captureStream !== "undefined" ? video.captureStream() : video.mozCaptureStream(); // Firefox has a different name for the captureStream function
        for (const key in settings) settings[key] = parseInt(settings[key]) || undefined; // Delete null, NaN or "" placeholders
        try { // Try saving the file using the File System API. If not available, the standard link method will be used.
            fileWritable = await (await window.showSaveFilePicker({ id: channelLink.substring(channelLink.lastIndexOf("/") + 1).replace("@", "").substring(0, 32), suggestedName: `${suggestedName}.${extension}` })).createWritable();
        } catch (ex) {

        }
        mediaRecorder = new MediaRecorder(stream, { ...settings }); // Initialize the new MediaRecorder
        mediaRecorder.ondataavailable = fileWritable ? async (event) => { // Since a Writable is being used, the file will be directly written on the device
            event.data.size > 0 && fileWritable.write({ data: event.data, position: writePosition, type: "write" });
            writePosition += event.data.size;
        } : (event) => { // No Writable is being used. So, we'll add the Blob to an array
            event.data.size > 0 && chunks.push(event.data);
        };
        mediaRecorder.onstop = async () => {
            if (!fileWritable) {
                const blob = new Blob(chunks, { type: `video/${extension}` }); // Create the output blob with all the merged files
                const a = document.createElement("a"); // And download it using a link
                a.href = URL.createObjectURL(blob);
                a.download = `${suggestedName}.${extension}`;
                a.click();
                URL.revokeObjectURL(a.href);
            } else await fileWritable.close(); // If the File System API is being used, just close the writable.
            // Restore the values at their original value
            chunks = [];
            mediaRecorder = null;
            fileWritable = null;
            writePosition = 0;
            suggestedName = crypto?.randomUUID() ?? Math.random();
            browserToUse.runtime.sendMessage(browserToUse.runtime.id, { action: "running", content: false }); // Say to the extension that the conversion has ended
            !video.paused && !forceStop && startContent(); // If the user hasn't manually stopped the video, and it's still playing, start a new reproduction.
        };
        mediaRecorder.start(fileWritable ? 500 : undefined);
        browserToUse.runtime.sendMessage(browserToUse.runtime.id, { action: "running", content: true });
    }
}

browserToUse.runtime.onMessage.addListener((msg) => {
    switch (msg.action) {
        case "start":
            if (mediaRecorder instanceof MediaRecorder) mediaRecorder.stop();
            startContent();
            break;
        case "stop":
            if (mediaRecorder instanceof MediaRecorder) {
                forceStop = true;
                mediaRecorder.stop();
            }
            break;
        case "running":
            browserToUse.runtime.sendMessage(browserToUse.runtime.id, { action: "running", content: mediaRecorder !== null })
            break;
        case "getAvailableCodecs":
            browserToUse.runtime.sendMessage(browserToUse.runtime.id, { action: "getAvailableCodecs", content: checkAvailableMimetypes() })
            break;
        case "updateFields":
            settings = { ...settings, ...msg.content }
            break;
    }
});
(async () => { // Update the settings by fetching the values in the sync storage
    const result = await browserToUse.storage.sync.get(Object.keys(settings));
    for (const key in result) {
        settings[key] = result[key] || settings[key];
    }
})()