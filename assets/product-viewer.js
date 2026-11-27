(() => {
    const viewer = document.getElementById('featureViewer');
    if (!viewer) return;

    const items = Array.from(viewer.querySelectorAll('.feature-item'));
    const media = Array.from(viewer.querySelectorAll('.viewer-media'));
    const videos = Array.from(viewer.querySelectorAll('.feature-video'));
    const list = viewer.querySelector('.feature-list');
    const previous = viewer.querySelector('.previous-feature');
    const next = viewer.querySelector('.next-feature');
    const close = viewer.querySelector('.close-viewer');
    const open = viewer.querySelector('.open-viewer');
    const closedState = viewer.querySelector('.closed-state');
    const playback = viewer.querySelector('.media-playback');
    const pauseSymbol = playback.querySelector('.pause-symbol');
    const playSymbol = playback.querySelector('.play-symbol');
    const mobile = window.matchMedia('(max-width: 734px)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finishedVideos = new WeakSet();
    let active = 'display';
    let closed = false;
    let playRequested = false;
    let manualPlayback = false;
    let swipeStart = null;

    const centerActive = (smooth = true) => {
        if (!mobile.matches) return;
        const item = items.find(entry => entry.dataset.feature === active);
        const left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
        list.scrollTo({ left, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
    };

    const resetVideo = video => {
        if (!video) return;
        video.pause();
        video.currentTime = 0;
        video.closest('.viewer-media').classList.remove('is-playing');
        finishedVideos.delete(video);
    };

    const updatePlaybackButton = () => {
        const video = videos.find(entry => entry.dataset.video === active);
        const paused = !video || video.paused;
        viewer.dataset.playback = paused ? 'paused' : 'playing';
        pauseSymbol.style.display = paused ? 'none' : '';
        playSymbol.style.display = paused ? '' : 'none';
        playback.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    };

    const syncPlayback = () => {
        videos.forEach(video => {
            const motionAllowed = !reducedMotion.matches || manualPlayback;
            const shouldPlay = playRequested && motionAllowed && !closed && !document.hidden && !finishedVideos.has(video) && video.dataset.video === active;
            if (shouldPlay) {
                const promise = video.play();
                if (promise) promise.catch(() => {});
            } else {
                video.pause();
            }
        });
        window.setTimeout(updatePlaybackButton, 80);
    };

    const selectFeature = (id, options = {}) => {
        if (!items.some(item => item.dataset.feature === id)) return;
        active = id;
        viewer.dataset.active = id;
        manualPlayback = false;
        const selectedVideo = videos.find(video => video.dataset.video === id);
        resetVideo(selectedVideo);
        playRequested = Boolean(selectedVideo && !options.initial);

        items.forEach(item => {
            const selected = item.dataset.feature === id;
            item.classList.toggle('is-active', selected);
            item.querySelector('.feature-trigger').setAttribute('aria-expanded', String(selected));
            item.querySelector('.feature-detail').setAttribute('aria-hidden', String(!selected));
        });

        media.forEach(element => {
            const selected = element.dataset.media === id;
            element.classList.toggle('is-active', selected);
            element.setAttribute('aria-hidden', String(!selected));
        });

        const index = items.findIndex(item => item.dataset.feature === id);
        previous.disabled = index === 0;
        next.disabled = index === items.length - 1;
        syncPlayback();
        window.requestAnimationFrame(() => centerActive(!options.initial));
    };

    const togglePlayback = () => {
        const video = videos.find(entry => entry.dataset.video === active);
        if (!video || closed) return;
        if (finishedVideos.has(video)) resetVideo(video);
        playRequested = video.paused;
        manualPlayback = playRequested;
        syncPlayback();
    };

    const closeViewer = () => {
        if (closed) return;
        closed = true;
        playRequested = false;
        viewer.classList.add('is-closed');
        closedState.setAttribute('aria-hidden', 'false');
        syncPlayback();
        open.focus({ preventScroll: true });
    };

    const openViewer = () => {
        closed = false;
        viewer.classList.remove('is-closed');
        closedState.setAttribute('aria-hidden', 'true');
        selectFeature('display', { initial: true });
        close.focus({ preventScroll: true });
    };

    items.forEach(item => {
        item.querySelector('.feature-trigger').addEventListener('click', () => selectFeature(item.dataset.feature));
    });

    previous.addEventListener('click', () => {
        const index = items.findIndex(item => item.dataset.feature === active);
        if (index > 0) selectFeature(items[index - 1].dataset.feature);
    });

    next.addEventListener('click', () => {
        const index = items.findIndex(item => item.dataset.feature === active);
        if (index < items.length - 1) selectFeature(items[index + 1].dataset.feature);
    });

    viewer.querySelectorAll('input[name="finish"]').forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            const finish = input.value;
            viewer.dataset.color = finish;
            viewer.querySelector('.shown-color').textContent = finish === 'silver' ? 'Silver' : 'Space Black';
            const swatch = viewer.querySelector('.mini-swatch');
            swatch.classList.toggle('silver', finish === 'silver');
            swatch.classList.toggle('space-black', finish === 'space-black');
        });
    });

    playback.addEventListener('click', togglePlayback);

    videos.forEach(video => {
        video.addEventListener('click', togglePlayback);
        video.addEventListener('play', () => {
            video.closest('.viewer-media').classList.add('is-playing');
            updatePlaybackButton();
        });
        video.addEventListener('pause', updatePlaybackButton);
        video.addEventListener('ended', () => {
            playRequested = false;
            manualPlayback = false;
            finishedVideos.add(video);
            video.pause();
            video.currentTime = 0;
            video.closest('.viewer-media').classList.remove('is-playing');
            updatePlaybackButton();
        });
    });

    close.addEventListener('click', closeViewer);
    open.addEventListener('click', openViewer);

    viewer.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeViewer();
            return;
        }
        if (closed || event.target.matches('input')) return;
        const index = items.findIndex(item => item.dataset.feature === active);
        if (event.key === 'ArrowUp' && index > 0) {
            event.preventDefault();
            selectFeature(items[index - 1].dataset.feature);
        } else if (event.key === 'ArrowDown' && index < items.length - 1) {
            event.preventDefault();
            selectFeature(items[index + 1].dataset.feature);
        }
    });

    viewer.addEventListener('pointerdown', event => {
        if (!mobile.matches || event.target.closest('button, input, label, .feature-list')) return;
        swipeStart = { x: event.clientX, y: event.clientY };
    });

    viewer.addEventListener('pointerup', event => {
        if (!swipeStart) return;
        const x = event.clientX - swipeStart.x;
        const y = event.clientY - swipeStart.y;
        swipeStart = null;
        if (Math.abs(x) < 60 || Math.abs(x) < Math.abs(y)) return;
        const index = items.findIndex(item => item.dataset.feature === active);
        const target = x < 0 ? index + 1 : index - 1;
        if (items[target]) selectFeature(items[target].dataset.feature);
    });

    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', syncPlayback);
    mobile.addEventListener('change', () => centerActive(false));
    window.addEventListener('resize', () => centerActive(false));

    selectFeature(active, { initial: true });
})();
