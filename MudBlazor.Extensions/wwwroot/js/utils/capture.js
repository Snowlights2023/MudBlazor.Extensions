﻿class MudExCapture {
    static recordings = {};
    static _preselected = {};

    static setText(videoElement, text) {
        videoElement = MudExObserver.getElement(videoElement);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 640;
        canvas.height = 480;

        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = '48px Arial';
        context.fillStyle = 'white';
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(-Math.PI / 4);
        context.textAlign = 'center';
        context.fillText(text, 0, 0);

        const stream = canvas.captureStream(30); // 30 fps
        if (videoElement && typeof videoElement.play === 'function') {
            videoElement.autoplay = true;
            videoElement.muted = true;
            videoElement.srcObject = stream;
            videoElement.play();
        }
    }

    static switchSrcObject(videoElement1, videoElement2, condition) {
        const element1 = MudExObserver.getElement(videoElement1);
        const element2 = MudExObserver.getElement(videoElement2);
        if (element1 && element2 && condition) {
            var srcObject1 = element1.srcObject;
            element1.srcObject = element2.srcObject;
            element2.srcObject = srcObject1;
        }
    }

    static async selectCaptureSource(captureMediaOptions, videoElementForPreview) {
        try {
            var captureMediaOptionsWithoutNullProperties = this.removeOptionsWithoutNullProperties(captureMediaOptions);
            var stream = null;
            if (captureMediaOptions.video?.deviceId)
                stream = await navigator.mediaDevices.getUserMedia(this.prepareVideoConstraints(captureMediaOptions.video.deviceId, captureMediaOptions.video));
            else if (captureMediaOptions.audio?.deviceId)
                stream = await navigator.mediaDevices.getUserMedia(this.prepareAudioConstraints(captureMediaOptions.audio.deviceId, captureMediaOptions.audio));
            else
                stream = await navigator.mediaDevices.getDisplayMedia(captureMediaOptionsWithoutNullProperties);

            const selectedTrack = stream.getVideoTracks()[0];
            const element = MudExObserver.getElement(videoElementForPreview);
            if (element && typeof element.play === 'function') {
                element.autoplay = true;
                element.muted = true;
                element.srcObject = stream;
                element.play();
            }
            //stream.getTracks().forEach(track => track.stop());
            this._preselected[selectedTrack.id] = stream;
            return {
                id: selectedTrack.id,
                label: selectedTrack.label,
                kind: selectedTrack.kind,
                deviceId: selectedTrack.getSettings().deviceId,
                stats: selectedTrack.stats,
                enabled: selectedTrack.enabled,
                muted: selectedTrack.muted,
                readyState: selectedTrack.readyState
            };
        } catch (err) {
            console.error("Error selecting capture source", err);
            return null;
        }
    }



    static stopPreviewCapture(trackId) {
        const stream = this._preselected[trackId];
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            delete this._preselected[trackId];
        }
    }

    static async startCapture(options, callback) {
        const id = this.generateUniqueId();
        const capture = await this.setupCapture(options, id, callback);
        if (capture.screenStream) {
            capture.screenStream.addEventListener("inactive", () => {
                this.stopCapture(id, callback);
            });
            capture.screenStream.getVideoTracks()[0].addEventListener("ended", () => {
                this.stopCapture(id, callback);
            });
        }
        capture.recorders.forEach(recorder => {
            setTimeout(() => { recorder.start(); }, 1);
        });

        this.recordings[id] = capture;
        return id;
    }

    static stopCapture(id, callback) {
        if (callback && callback['invokeMethodAsync']) {
            callback.invokeMethodAsync('OnStopped', id);
        }
        const recording = this.recordings[id];
        if (recording) {
            recording.recorders.forEach(recorder => {
                try {
                    recorder.stop();
                } catch (e) {

                }
            });
            recording.streams.forEach(stream => {
                if (stream && typeof stream.getTracks === 'function') {
                    stream.getTracks().forEach(track => {
                        try {
                            track.stop();
                        } catch (e) {

                        }
                    });
                }
            });
            if (recording.audioContext) {
                try {
                    recording.audioContext.close();
                } catch (e) {

                }
            }
            delete this.recordings[id];
        }
        this._preselected[id] = null;
        delete this._preselected[id];
    }

    static removeOptionsWithoutNullProperties(captureMediaOptions) {
        var captureMediaOptionsWithoutNullProperties = {};
        for (var key in captureMediaOptions) {
            if (Object.prototype.hasOwnProperty.call(captureMediaOptions, key)) {
                if (captureMediaOptions[key] !== null) {
                    captureMediaOptionsWithoutNullProperties[key] = captureMediaOptions[key];
                }
            }
        }
        return captureMediaOptionsWithoutNullProperties;
    }

    static prepareAudioConstraints(deviceId, constraints) {
        return this.constraintsAsMediaOptions(deviceId, constraints, 'audio');
    }

    static prepareVideoConstraints(deviceId, constraints) {
        return this.constraintsAsMediaOptions(deviceId, constraints, 'video');
    }

    static constraintsAsMediaOptions(deviceId, constraints, section) {
        const constraintsCopy = constraints ? { ...constraints } : {};
        deviceId = deviceId || constraintsCopy.deviceId;

        const result = {};
        result[section] = { ...constraintsCopy }; 
        result[section].deviceId = deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined;

        return result;
    }

    static async setupCapture(options, id, callback) {
        var captureMediaOptionsWithoutNullProperties = this.removeOptionsWithoutNullProperties(options.captureMediaOptions);
        options.contentType = options.contentType || 'video/webm; codecs=vp9';
        const audioContentType = options.audioContentType || 'audio/webm';
        if (!options.captureScreen && !options.videoDevice && !options.videoConstraints?.deviceId) {
            // if only audio is captured, set content type to audio
            options.contentType = audioContentType;
        }

        const streams = {
            screen: null,
            camera: null,
            audio: null,
            systemAudio: null,
            audioContext: null
        };

        if (options.captureScreen) {
            try {
                let screenStream;
                if (options.screenSource && this._preselected[options.screenSource.id]) {
                    screenStream = this._preselected[id] = this._preselected[options.screenSource.id];
                    delete this._preselected[options.screenSource.id];
                }
                else {
                    screenStream = await navigator.mediaDevices.getDisplayMedia(captureMediaOptionsWithoutNullProperties);
                }
                streams.screen = new MediaStream(screenStream.getVideoTracks());

                const systemAudioTracks = screenStream.getAudioTracks();
                if (systemAudioTracks.length > 0) {
                    streams.systemAudio = new MediaStream(systemAudioTracks);
                }
            } catch (error) {
                console.warn('System Audio konnte nicht erfasst werden:', error);
            }
        }

        // Camera Stream
        if (options.videoDevice) {
            let videoDeviceId = typeof options.videoDevice === 'string'
                ? options.videoDevice
                : options.videoDevice?.deviceId;

            const constraints = typeof options.videoDevice === 'string' ? {} : options.videoDevice;

            const videoParam = this.prepareVideoConstraints(videoDeviceId, constraints);

            try {
                streams.camera = await navigator.mediaDevices.getUserMedia(videoParam);

            } catch (e) {
                console.error('Error while accessing the camera:', e);
            }
        }


        // Audio Streams
        const audioStreams = await this.getAudioStreams(options.audioDevices);
        // Audio Streams mischen
        const { stream: mixedAudioStream, audioContext } = this.mixAudioStreams(audioStreams);
        streams.audio = mixedAudioStream;
        streams.audioContext = audioContext;

        // Canvas Picture-in-Picture Setup
        const { combinedStream, canvas } = this.createCombinedStream(streams, options, id);

        // Chunks
        const chunks = {
            screen: [],
            camera: [],
            audio: [],
            systemAudio: [],
            combined: []
        };

        const recorders = [];

        // Main recorder
        if (streams.screen) {
            const screenRecorder = new MediaRecorder(streams.screen, { mimeType: options.contentType });
            screenRecorder.ondataavailable = event => chunks.screen.push(event.data);
            recorders.push(screenRecorder);
        }

        // System Audio Recorder
        if (streams.systemAudio) {
            const systemAudioRecorder = new MediaRecorder(streams.systemAudio, { mimeType: audioContentType });
            systemAudioRecorder.ondataavailable = event => chunks.systemAudio.push(event.data);
            recorders.push(systemAudioRecorder);
        }

        // Cam Recorder
        if (streams.camera) {
            const cameraRecorder = new MediaRecorder(streams.camera, { mimeType: options.contentType });
            cameraRecorder.ondataavailable = event => chunks.camera.push(event.data);
            recorders.push(cameraRecorder);
        }

        // Mic Audio Recorder
        if (streams.audio) {
            const audioRecorder = new MediaRecorder(streams.audio, { mimeType: audioContentType });
            audioRecorder.ondataavailable = event => chunks.audio.push(event.data);
            recorders.push(audioRecorder);
        }

        // Combined Recorder
        if (combinedStream) {
            const combinedRecorder = new MediaRecorder(combinedStream, { mimeType: options.contentType });
            combinedRecorder.ondataavailable = event => chunks.combined.push(event.data);
            combinedRecorder.onstop = async () => {
                if (canvas && canvas.stream) {
                    canvas.stream.getTracks().forEach(track => track.stop());
                }
                await this.saveVideoData(chunks, callback, id, options);
            };
            recorders.push(combinedRecorder);
        }
        return {
            streams: Object.values(streams).filter(stream => stream !== null),
            recorders,
            screenStream: streams.screen,
            cameraStream: streams.camera,
            audioStream: streams.audio,
            systemAudioStream: streams.systemAudio,
            combinedStream,
            canvas,
            audioContext: streams.audioContext
        };
    }

    static createCombinedStream(streams, options, id) {
        const { screen, camera, audio, systemAudio, audioContext } = streams;
        // Mix audio streams
        const audioStreamsToMix = [audio, systemAudio].filter(s => s);
        const { stream: mixedAudioStream } = this.mixAudioStreams(audioStreamsToMix);
        streams.audioContext = audioContext;

        // Wenn wir keine visuellen Streams haben, kombiniere nur Audio
        if (!screen && !camera) {
            return {
                combinedStream: mixedAudioStream,
                canvas: null
            };
        }

        // Wenn wir nur einen visuellen Stream haben
        if (!screen || !camera) {
            const videoStream = screen || camera;
            return {
                combinedStream: this.combineStreams(videoStream, mixedAudioStream),
                canvas: null
            };
        }

        // Picture-in-Picture Setup für Screen + Camera
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Screen-Größe als Basis verwenden
        const screenTrack = screen.getVideoTracks()[0];
        const settings = screenTrack.getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;

        // Video Elemente für beide Streams
        const mainVideo = document.createElement('video');
        const overlayVideo = document.createElement('video');

        var useVideoDeviceAsOverlay = options.overlaySource === 'VideoDevice';
        mainVideo.srcObject = useVideoDeviceAsOverlay ? screen : camera;
        overlayVideo.srcObject = useVideoDeviceAsOverlay ? camera : screen;
        mainVideo.play();
        overlayVideo.play();

        // Frame Rate einstellen
        const frameRate = options.frameRate || 30;
        const frameInterval = 1000 / frameRate;

        const calculateOverlayPosition = (position, size, canvasWidth, canvasHeight) => {
            let x = 0;
            let y = 0;

            // Overlay-Größe parsen
            let overlayWidth, overlayHeight;
            try {
                const sizeObj = typeof size === 'string' ? JSON.parse(size) : size;
                overlayWidth = sizeObj.width.cssValue.includes('%')
                    ? (canvasWidth * parseFloat(sizeObj.width.cssValue) / 100)
                    : parseFloat(sizeObj.width.cssValue);
                overlayHeight = sizeObj.height.cssValue.includes('%')
                    ? (canvasHeight * parseFloat(sizeObj.height.cssValue) / 100)
                    : parseFloat(sizeObj.height.cssValue);
            } catch (e) {
                // Fallback zu Standard-Größen
                overlayWidth = canvasWidth * 0.2;
                overlayHeight = (canvasWidth * 0.2) * (9 / 16);
            }

            // Position basierend auf Option berechnen
            if (position === 'Custom' && options.overlayCustomPosition) {
                try {
                    const customPos = typeof options.overlayCustomPosition === 'string'
                        ? JSON.parse(options.overlayCustomPosition)
                        : options.overlayCustomPosition;

                    x = customPos.left.cssValue.includes('%')
                        ? (canvasWidth * parseFloat(customPos.left.cssValue) / 100)
                        : parseFloat(customPos.left.cssValue);

                    y = customPos.top.cssValue.includes('%')
                        ? (canvasHeight * parseFloat(customPos.top.cssValue) / 100)
                        : parseFloat(customPos.top.cssValue);

                } catch (e) {
                    console.warn('Fehler beim Parsen der Custom Position:', e);
                    x = 20;
                    y = canvasHeight - overlayHeight - 20;
                }
            } else {
                switch (position) {
                    case 'Center':
                        x = (canvasWidth - overlayWidth) / 2;
                        y = (canvasHeight - overlayHeight) / 2;
                        break;
                    case 'CenterLeft':
                        x = 20;
                        y = (canvasHeight - overlayHeight) / 2;
                        break;
                    case 'CenterRight':
                        x = canvasWidth - overlayWidth - 20;
                        y = (canvasHeight - overlayHeight) / 2;
                        break;
                    case 'TopCenter':
                        x = (canvasWidth - overlayWidth) / 2;
                        y = 20;
                        break;
                    case 'TopLeft':
                        x = 20;
                        y = 20;
                        break;
                    case 'TopRight':
                        x = canvasWidth - overlayWidth - 20;
                        y = 20;
                        break;
                    case 'BottomCenter':
                        x = (canvasWidth - overlayWidth) / 2;
                        y = canvasHeight - overlayHeight - 20;
                        break;
                    case 'BottomLeft':
                        x = 20;
                        y = canvasHeight - overlayHeight - 20;
                        break;
                    case 'BottomRight':
                    default:
                        x = canvasWidth - overlayWidth - 20;
                        y = canvasHeight - overlayHeight - 20;
                        break;
                }
            }

            return { x, y, width: overlayWidth, height: overlayHeight };
        };

        // Optimiertes Picture-in-Picture Rendering
        let lastDrawTime = 0;
        const draw = (timestamp) => {
            if (!this.recordings[id]) {
                return;
            }
            if (!lastDrawTime || (timestamp - lastDrawTime) >= frameInterval) {
                lastDrawTime = timestamp;
                ctx.drawImage(mainVideo, 0, 0, canvas.width, canvas.height);
                // Overlay Position und Größe berechnen
                const overlay = calculateOverlayPosition(
                    options.overlayPosition,
                    options.overlaySize,
                    canvas.width,
                    canvas.height
                );

                // Kamera als Overlay zeichnen
                ctx.drawImage(overlayVideo,
                    overlay.x,
                    overlay.y,
                    overlay.width,
                    overlay.height
                );
            }
            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);

        // Canvas als Stream mit begrenzter Frame Rate
        const canvasStream = canvas.captureStream(frameRate);

        // Gemischten Audio Stream hinzufügen
        if (mixedAudioStream) {
            mixedAudioStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
        }

        return {
            combinedStream: canvasStream,
            canvas: {
                element: canvas,
                stream: canvasStream,
                videos: [mainVideo, overlayVideo]
            }
        };
    }

    static async getAudioStreams(audioDevices) {
        if (!audioDevices || audioDevices.length === 0) return [];

        const audioStreams = await Promise.all(
            audioDevices.map(async device => {
                try {
                    const deviceId = typeof device === 'string' ? device : device.deviceId;
                    const audioConstraints = typeof device === 'string' ? {} : device;

                    return await navigator.mediaDevices.getUserMedia(this.prepareAudioConstraints(deviceId, audioConstraints));
                } catch (error) {
                    console.warn(`Audio device with ID ${deviceId} konnte nicht abgerufen werden.`, error);
                    return null;
                }
            })
        );

        return audioStreams.filter(stream => stream !== null);
    }

    static combineStreams(videoStream, audioStream) {
        const combinedStream = new MediaStream();
        if (videoStream) {
            videoStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
            // Entferne Audio-Tracks vom VideoStream, wenn vorhanden
            videoStream.getAudioTracks().forEach(track => track.stop());
        }
        if (audioStream) {
            audioStream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        }
        return combinedStream;
    }

    static mixAudioStreams(audioStreams) {
        if (!audioStreams || audioStreams.length === 0) return { stream: null, audioContext: null };

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const destination = audioContext.createMediaStreamDestination();

        audioStreams.forEach(stream => {
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(destination);
        });

        return { stream: destination.stream, audioContext };
    }

    static generateUniqueId() {
        return `${new Date().getTime()}`;
    }

    static async saveVideoData(chunks, callback, id, options) {
        const { screen, camera, audio, systemAudio, combined } = chunks;

        const createBlobData = async (chunks, contentType) => {
            if (!chunks || chunks.length === 0) return null;
            const blob = new Blob(chunks, { type: contentType });
            const arrayBuffer = await blob.arrayBuffer();
            return {
                bytes: new Uint8Array(arrayBuffer),
                blobUrl: URL.createObjectURL(blob),
                contentType
            };
        };

        const result = {
            captureData: await createBlobData(screen, options.contentType),
            cameraData: await createBlobData(camera, options.contentType),
            audioData: await createBlobData(audio, options.audioContentType || 'audio/webm'),
            systemAudioData: await createBlobData(systemAudio, options.audioContentType || 'audio/webm'),
            combinedData: await createBlobData(combined, options.contentType),
            options: options,
            captureId: id
        };

        if (callback['invokeMethodAsync']) {
            callback.invokeMethodAsync('Invoke', result);
        }
    }

    static async getDevices() {
        return await navigator.mediaDevices.enumerateDevices();
    }

    static async getAvailableAudioDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        } catch (e) { }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'audioinput');
    }

    static async getAvailableVideoDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (e) { }
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'videoinput');
    }
}

window.MudExCapture = MudExCapture;
