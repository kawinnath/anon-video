import { useState, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, deleteDoc, increment } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

function timeAgo(ms) {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Helper to determine if link is YouTube/Vimeo or a generic Embed
function getEmbedUrl(url) {
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  const vimeoMatch = url.match(/vimeo\.com\/(?:.*#|.*\/videos\/)?([0-9]+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  
  // Universal fallback: If the URL contains an explicit embed path, permit it as an iframe!
  if (url.includes('/embed/') || url.includes('/iframe/')) {
    return url;
  }
  
  return null;
}

// Icons
const MoonIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
);
const SunIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
);
const HeartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
);
const UploadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
);
const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

// Unified Video Player
function FeedVideoPlayer({ video }) {
  if (!video.videoUrl) return null;

  // Render iframe for embedded platforms (YouTube, Vimeo)
  const embedUrl = video.type === 'link' ? getEmbedUrl(video.videoUrl) : null;
  if (embedUrl) {
    return (
      <iframe 
        src={embedUrl} 
        title="Video player" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
        allowFullScreen
      ></iframe>
    );
  }

  // Render native video player for Blobs or raw video URLs (.mp4)
  return (
    <video 
      key={video.videoUrl}
      src={video.videoUrl}
      controls 
      controlsList="nodownload"
      preload="auto"
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  );
}

function App() {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  const [videos, setVideos] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);

  const [likedVideos, setLikedVideos] = useState(() => {
    const saved = localStorage.getItem('anonLikedVideosV3_Global');
    return saved ? JSON.parse(saved) : [];
  });

  // Form State
  const [uploadMethod, setUploadMethod] = useState('file'); // 'file' or 'link'
  const [selectedFile, setSelectedFile] = useState(null);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');

  // Setup Firebase Real-Time Synchronization Listener
  useEffect(() => {
    // If Firebase logic is uninitialized because missing keys
    if (db.app.options.apiKey === "YOUR_API_KEY") {
      setError("Please put your Firebase config keys inside src/firebase.js to activate global feed!");
      setIsLoaded(true);
      return;
    }

    const q = query(collection(db, "anonvideos"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const vids = [];
      querySnapshot.forEach((doc) => {
        vids.push({ id: doc.id, ...doc.data() });
      });
      setVideos(vids);
      setIsLoaded(true);
    }, (err) => {
      console.error("Firestore Listen Error:", err);
      setError("Failed to connect to Firebase. Ensure rules are open and Config is correct.");
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('anonLikedVideosV3_Global', JSON.stringify(likedVideos));
  }, [likedVideos]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLike = async (id) => {
    if (likedVideos.includes(id)) return; 
    setLikedVideos(prev => [...prev, id]);
    // Firestore synchronization
    const vidRef = doc(db, "anonvideos", id);
    try {
      await updateDoc(vidRef, {
        likes: increment(1)
      });
    } catch (err) {
      console.error("Error liking doc", err);
    }
  };

  const handleDelete = async (video) => {
    if (window.confirm('Are you sure you want to permanently delete this video globally?')) {
      try {
        // Delete Firestore document
        await deleteDoc(doc(db, "anonvideos", video.id));
        
        // If it was a file upload, delete natively from Firebase Storage
        if (video.type === 'file' && video.storagePath) {
           const fileRef = ref(storage, video.storagePath);
           await deleteObject(fileRef);
        }
      } catch (err) {
         console.error("Deletion failed:", err);
         alert("Deletion failed! Check firebase rules.");
      }
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
       // Allow any video native formats
       setSelectedFile(file);
       setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (db.app.options.apiKey === "YOUR_API_KEY") {
      setError("Firebase keys missing! Setup src/firebase.js first.");
      return;
    }

    setError('');
    
    if (uploadMethod === 'file') {
      if (!selectedFile) {
        setError('Please choose a video file to upload.');
        return;
      }
      
      setIsUploading(true);
      
      const storagePath = `anonvideos/${Date.now()}_${selectedFile.name}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, selectedFile);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadPercent(progress);
        }, 
        (error) => {
          console.error(error);
          setError(`Upload Error: ${error.message}. (Did you set Firebase Storage Rules to true?)`);
          setIsUploading(false);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          // Insert Global Record Into Firestore
          await addDoc(collection(db, "anonvideos"), {
            type: 'file',
            videoUrl: downloadURL,
            storagePath: storagePath,
            timestamp: Date.now(),
            likes: 0
          });
          
          setIsUploading(false);
          setUploadPercent(0);
          setSelectedFile(null);
        }
      );
      
    } else {
      if (!urlInput.trim()) {
        setError('Please paste a valid video URL.');
        return;
      }
      
      try {
        await addDoc(collection(db, "anonvideos"), {
          type: 'link',
          videoUrl: urlInput.trim(),
          timestamp: Date.now(),
          likes: 0
        });
        setUrlInput('');
      } catch(err) {
        console.error(err);
        setError('Failed to post link globally. Check Firestore rules!');
      }
    }
  };

  if (!isLoaded) return <div style={{ color: 'var(--text-color)', textAlign: 'center', marginTop: '3rem' }}>Connecting to Global Platform...</div>;

  return (
    <>
      <header>
        <div className="brand">
          <img src="/logo.png" alt="CSEBS Logo" className="brand-logo" /> 
          CSEBS.hub.org
        </div>
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main>
        <div className="glass-card submit-section">
          <h1>Sync The Feed Globally.</h1>
          <p>Any video linked or uploaded here is pushed to all online viewers synchronously in real time!</p>
          
          <div className="upload-toggle">
            <label>
              <input 
                type="radio" 
                name="method" 
                checked={uploadMethod === 'file'} 
                onChange={() => { setUploadMethod('file'); setError(''); }} 
                disabled={isUploading}
              /> 
              Upload File
            </label>
            <label>
              <input 
                type="radio" 
                name="method" 
                checked={uploadMethod === 'link'} 
                onChange={() => { setUploadMethod('link'); setError(''); }} 
                disabled={isUploading}
              /> 
              Paste Link
            </label>
          </div>

          <form className="submit-form" onSubmit={handleSubmit}>
            <div className="input-group">
              {uploadMethod === 'file' ? (
                <input 
                  id="video-upload"
                  type="file" 
                  onChange={handleFileChange}
                  className="file-input"
                  disabled={isUploading}
                />
              ) : (
                <input 
                  type="text" 
                  placeholder="Paste video URL (YouTube, Vimeo, MP4)..." 
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setError(''); }}
                  disabled={isUploading}
                />
              )}
            </div>
            
            <button type="submit" className="primary" disabled={isUploading}>
              <UploadIcon /> {isUploading ? 'Uploading...' : 'Blast Global'}
            </button>
          </form>
          {isUploading && (
            <div className="upload-progress">
               <div className="progress-bar" style={{ width: `${uploadPercent}%` }}></div>
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', marginTop: '1rem', fontWeight: 500 }}>{error}</div>}
        </div>

        <div className="video-grid">
          {videos.length === 0 ? (
            <div className="empty-state">
              <p>Global feed is empty. Be the first to share one!</p>
            </div>
          ) : (
            videos.map(video => (
              <div className="glass-card video-card" key={video.id}>
                <div className="video-wrapper">
                  <FeedVideoPlayer video={video} />
                </div>
                <div className="video-details">
                  <div className="video-meta" style={{ justifyContent: 'flex-end' }}>
                    <span className="timestamp">{timeAgo(video.timestamp)}</span>
                  </div>
                  <div className="video-actions">
                    <button 
                      className={`like-btn ${likedVideos.includes(video.id) ? 'liked' : ''}`}
                      onClick={() => handleLike(video.id)}
                      disabled={likedVideos.includes(video.id)}
                    >
                      <HeartIcon />
                      {video.likes}
                    </button>
                    <button className="delete-btn" onClick={() => handleDelete(video)} title="Delete Video Globally">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </>
  );
}

export default App;
