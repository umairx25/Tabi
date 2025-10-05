const videoSources = [
    'assets/tabi_remove.mp4',
    'assets/tabi_generate.mp4',
  'assets/tabi_find.mp4',
];

const videos = document.querySelectorAll('.video-player');
const dots = document.querySelectorAll('.dot');
let currentVideo = 0;

// Initialize videos
videos.forEach((vid, i) => {
  vid.src = videoSources[i];
  vid.load();
  if (i === 0) {
    vid.classList.add('active');
  }
});

// Update visible video
function showVideo(index) {
  videos.forEach((v, i) => {
    v.classList.toggle('active', i === index);
    if (i === index) {
      v.currentTime = 0; // Reset to start
      v.play();
    } else {
      v.pause();
    }
  });

  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });

  currentVideo = index;
}

// Listen for video end
videos.forEach((video, index) => {
  video.addEventListener('ended', () => {
    const next = (index + 1) % videos.length;
    showVideo(next);
  });
});

// Manual navigation
dots.forEach((dot, index) => {
  dot.addEventListener('click', () => {
    showVideo(index);
  });
});

// Start first video
showVideo(0);