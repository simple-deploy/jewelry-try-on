const API_KEY = "sk-bohYH3M56flfVu-B_PPAFIOIdM-ZcrQG9vfXsDJorMMYK1rWZEXPWYGHqbit7oQv";
const BASE_URL_BRACELET = 'https://yce-api-01.makeupar.com/s2s/v2.0/task/2d-vto/bracelet';
const BASE_URL_NECKLACE = 'https://yce-api-01.makeupar.com/s2s/v2.0/task/2d-vto/necklace';
const HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + API_KEY
};

const btn = document.getElementById("generateBtn");
const statusDiv = document.getElementById("status");
const outputImage = document.getElementById("outputImage");

const humanInput = document.getElementById("humanInput");
const clothInput = document.getElementById("clothInput");
const humanPreview = document.getElementById("humanPreview");
const clothPreview = document.getElementById("clothPreview");

const typeRadios = document.querySelectorAll('input[name="jewelryType"]');
const pageTitle = document.getElementById("pageTitle");
const itemLabel = document.getElementById("itemLabel");

typeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'necklace') {
            pageTitle.innerText = '✨ Necklace Try-On';
            itemLabel.innerText = 'Upload Necklace';
        } else {
            pageTitle.innerText = '✨ Bracelet Try-On';
            itemLabel.innerText = 'Upload Bracelet';
        }
    });
});

// Update preview for human photo
humanInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        humanPreview.src = URL.createObjectURL(file);
        humanPreview.style.display = "block";
    } else {
        humanPreview.style.display = "none";
    }
});

// Update preview for bracelet photo
clothInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
        clothPreview.src = URL.createObjectURL(file);
        clothPreview.style.display = "block";
    } else {
        clothPreview.style.display = "none";
    }
});

// The YouCam API expects public URLs for images, so we temporarily host local files
async function uploadToTmpFiles(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        throw new Error("Failed to upload image temporarily for the API.");
    }

    const result = await res.json();
    // Transform standard url to a direct download link
    const directUrl = result.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    return directUrl;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startTask(humanUrl, itemUrl, type) {
    const baseUrl = type === 'necklace' ? BASE_URL_NECKLACE : BASE_URL_BRACELET;

    let objectParameter = {};
    if (type === 'necklace') {
        objectParameter = {
            "necklace_need_remove_background": true,
            "necklace_shadow_intensity": 0.5,
            "necklace_ambient_light_intensity": 0.5
        };
    } else {
        objectParameter = {
            "bracelet_need_remove_background": true,
            "bracelet_wearing_location": 0,
            "bracelet_shadow_intensity": 0.3,
            "bracelet_ambient_light_intensity": 1
        };
    }

    const init = {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
            "src_file_url": humanUrl,
            "source_info": {
                "name": humanUrl
            },
            "ref_file_urls": [itemUrl],
            "ref_file_ids": [],
            "refmsk_file_urls": [],
            "refmsk_file_ids": [],
            "object_infos": [
                {
                    "name": itemUrl,
                    "parameter": objectParameter
                }
            ]
        }),
    };

    console.log(`Starting ${type} task Request:`, init);

    const res = await fetch(baseUrl, init);
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Start request failed: ${res.status} ${res.statusText} - Details: ${errText}`);
    }

    const payload = await res.json().catch(() => ({}));
    const taskId = payload?.data?.task_id;
    if (!taskId) {
        throw new Error('task_id not found in response: ' + JSON.stringify(payload));
    }

    console.log('[startTask] Task started, id =', taskId);
    return taskId;
}

async function pollTask(taskId, type, { intervalMs = 2000, maxAttempts = 100 } = {}) {
    const baseUrl = type === 'necklace' ? BASE_URL_NECKLACE : BASE_URL_BRACELET;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const pollUrl = baseUrl + '/' + taskId;
        const res = await fetch(pollUrl, { method: 'GET', headers: HEADERS });

        if (!res.ok) {
            throw new Error(`Polling failed: ${res.status} ${res.statusText}`);
        }

        const payload = await res.json().catch(() => ({}));
        const status = payload?.data?.task_status;
        console.log('[pollTask] Attempt', attempt, 'status =', status);

        if (status === 'success') {
            const results = payload?.data?.results;
            console.log('[pollTask] Success results:', results);
            return payload;
        }
        if (status === 'error') {
            throw new Error('Task failed: ' + JSON.stringify(payload));
        }

        await sleep(intervalMs);
    }
    throw new Error('Max attempts exceeded while polling');
}

btn.onclick = async () => {
    try {
        const humanFile = document.getElementById("humanInput").files[0];
        const clothFile = document.getElementById("clothInput").files[0];

        if (!humanFile || !clothFile) {
            alert("Please upload both images");
            return;
        }

        btn.disabled = true;
        const selectedType = document.querySelector('input[name="jewelryType"]:checked').value;
        const typeName = selectedType.charAt(0).toUpperCase() + selectedType.slice(1);

        statusDiv.innerText = "Temporarily uploading images... ⏳";

        // Since YouCam needs URLs, upload them to tmpfiles
        const humanUrl = await uploadToTmpFiles(humanFile);
        const itemUrl = await uploadToTmpFiles(clothFile);

        statusDiv.innerText = "Connecting to YouCam API... ⏳";
        const taskId = await startTask(humanUrl, itemUrl, selectedType);

        statusDiv.innerText = `Processing ${typeName} Try-On... this may take a minute ⏳`;
        const finalData = await pollTask(taskId, selectedType);

        console.log("Final YouCam Response:", finalData);

        const results = finalData?.data?.results;

        // Attempt to extract the resulted image
        let finalImageUrl = "";
        if (results) {
            // Different payload structures depending on version
            if (results[0] && results[0].file_url) finalImageUrl = results[0].file_url;
            else if (results.file_url) finalImageUrl = results.file_url;
            else if (results[0] && results[0].url) finalImageUrl = results[0].url;
            else if (results.url) finalImageUrl = results.url;
            else if (typeof results[0] === 'string') finalImageUrl = results[0];
        }

        if (finalImageUrl) {
            outputImage.src = finalImageUrl;
            statusDiv.innerText = "Done ✅";
        } else {
            statusDiv.innerText = "Success, but URL structure unknown. JSON payload: " + JSON.stringify(finalData);
        }

    } catch (error) {
        console.error("ERROR:", error);
        statusDiv.innerText = "Error details: " + (error.message || JSON.stringify(error)) + " ❌";
    } finally {
        btn.disabled = false;
    }
};
