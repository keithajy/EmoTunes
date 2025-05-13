import React from "react";
import { Buffer } from "buffer";
import { CameraAlertDialog, RedirectAlertDialog } from '../components/Dialog.js';
import { HomeAppBar } from '../components/AppBar.js';
import { firestore } from "../firebase/Firebase.js"
import { doc, collection, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { IconButton } from '@mui/material';
import { Tune, SentimentSatisfiedAlt, SentimentVeryDissatisfied, SentimentSatisfied, SentimentDissatisfied, MoodBad } from '@mui/icons-material';

window.Buffer = Buffer;
const Rekognition = require("aws-sdk");
const WebCamera = require("webcamjs");
const intervalTime = 120000;
var nIntervalId;
var docRef;


const params = new URLSearchParams(window.location.hash.substring(1));
//var access_token = params.get("access_token");
//console.log(access_token);

// Get token from URL if available
let access_token = params.get("access_token");

// Store token in localStorage if it's new
if (access_token) {
    localStorage.setItem("spotify_access_token", access_token);
} else {
    // If token not in URL, try retrieving from localStorage
    access_token = localStorage.getItem("spotify_access_token");
}
console.log("1st ", access_token);

// Function to check if token is valid
async function validateSpotifyToken() {
    if (!access_token) {
        console.error("No Spotify access token found. Please authenticate.");
        return false;
    }

    // Test the token by making a request to Spotify
    const response = await fetch("https://api.spotify.com/v1/me", {
        method: "GET",
        headers: { "Authorization": `Bearer ${access_token}` }
    });

    if (response.status === 401) {
        console.error("Spotify token expired. Please refresh or re-authenticate.");
        return false;
    }

    return true;
}


export default function Work() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    console.log(params);
    var state = params.get("state").split('/');
    var username = state[1];
    var id = state[0];
    
    docRef = doc(firestore, "test_data", id);

    const handleSettings = () => {
        window.location.href = "./Welcome#access_token" + access_token + "&state=" + id + '/' + username 
    }

    const handleLogout = () => {
        window.location.href = './Login'
    }

    return (
        <div>
            <HomeAppBar handleLogout={handleLogout}/>
            <div style={{margin: '25px'}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                    <h2>Hi {username}!</h2>
                    <div>
                        <IconButton aria-label="settings" onClick={handleSettings}>
                            <Tune fontSize='large'/>
                        </IconButton>
                    </div>
                </div>
                <div id='playlist'><SpotifyEmbed/></div>
                <div id="camdemo" style={{height: "1px", width:"1px", textAlign:"center", margin:"0"}}></div>
                <CameraAlertDialog 
                    title='Detect Emotion?' 
                    contentText='This application requires your device camera to work.' 
                    label1='No' 
                    label2='Yes'
                    setDeny={ async () => {
                        console.log("Camera disabled");
                        await handleStartCam(false);
                    }}
                    setAllow={ async () => {
                        console.log("Camera enabled");
                        WebCamera.set({
                            // live preview size
                            width: 320,
                            height: 240,

                            // device capture size
                            dest_width: 640,
                            dest_height: 480,

                            // format and quality
                            image_format: 'jpeg',
                            jpeg_quality: 100,
                        });
                        await handleStartCam(true);
                    }}
                />
            </div>
        </div>
    )
}

async function handleStartCam(allow) {
    if (allow) {
        WebCamera.attach('#camdemo');
        console.log("Camera Starting up...");
        if (nIntervalId) clearInterval(nIntervalId);
        WebCamera.on('live', async function(){
            console.log("Webcam is live and ready!");
            await updateDoc(docRef, {emotion: ''})
            snapPic();
            nIntervalId = setInterval(snapPic, intervalTime);
        });
    }
    else { // disabled permissions
        clearInterval(nIntervalId);
        WebCamera.reset();
        console.log("The camera has been disabled");
        await updateDoc(docRef, {emotion: ''})
    }
} 

function snapPic() {
    setTimeout(()=>{
        WebCamera.snap((data_uri) => {
            // Save the image in a variable
            var imageBuffer = processBase64Image(data_uri);
            window.myFS.writeFile('emotionImg.jpeg', imageBuffer.data);
            console.log("Capture saved successfully!")
        });
        setTimeout(()=>{
            detectEmotion();
        },1000); // wait 1s before executing facial detection
    },2000); // ensures enough time for webcam to start
}

function processBase64Image(dataString) {
    var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),response = {};
    if (matches.length !== 3) {
        return new Error('Invalid input string');
    }
    response.type = matches[1];
    response.data = new Buffer.from(matches[2], 'base64');
    return response;
}

const emotionMapping = {
    "HAPPY": "happy",
    "SAD": "sad",
    "CONFUSED": "concentrating",
    "DISGUSTED": "stressed",
    "FEAR": "stressed",
    "CALM": "bored",
    "ANGRY": "angry",
    "SURPRISED": "happy", // If you want to associate surprised with happy
    "UNKNOWN": "bored"    // Default fallback in case emotion is unknown
};

async function detectEmotion() {
    var filePath = await window.myFS.readFile('emotionImg.jpeg');
    console.log(filePath);

    const rekognition = new Rekognition.Rekognition({
        region: 'xxxx', // your region (should be ap-southeast-1)
        accessKeyId: 'xxxx', // your access ID
        secretAccessKey: 'xxxx' // your secret access key
    });

    rekognition.detectFaces({
        Attributes: ["ALL"],
        Image: {
            Bytes: filePath
        }
    }, async (err, data) => {
        if (err) {
            console.log(err, err.stack);
        } else {
            console.log(data);
            if (data.FaceDetails.length != 0) {
                if (data.FaceDetails[0].Emotions[0].Confidence >= 75.0) {
                    let detectedEmotion = data.FaceDetails[0].Emotions[0].Type.toUpperCase();
                    let conf = data.FaceDetails[0].Emotions[0].Confidence;
                    console.log(`Detected emotion: ${detectedEmotion} ${conf}`);

                    let mappedEmotion = emotionMapping[detectedEmotion] || "bored"; // Default to 'bored' if not mapped
                    //let mappedEmotion = emotionMapping[detectedEmotion];

                    console.log(`Mapped emotion: ${mappedEmotion} `);

                    // Fetch user's saved playlists from Firebase
                    const docSnap = await getDoc(docRef);
                    const docData = docSnap.exists() ? docSnap.data() : {};
                    //const userPlaylists = docSnap.exists() ? docSnap.data().user_preferences || {} : {};
                    const userPlaylists = docData.user_preferences || {};
                    const currentEmotion = docData.emotion || "";

                    // Get playlist from Firebase
                    const playlistUri = userPlaylists[mappedEmotion] || null;
                    console.log(`Playlist for ${mappedEmotion}: ${playlistUri}`);

                    if (mappedEmotion !== currentEmotion) {
                        console.log(`Emotion changed from ${currentEmotion} to ${mappedEmotion}`);
                        if (playlistUri) {
                            console.log(`Playing playlist for emotion: ${mappedEmotion}`);
                            await updateDoc(docRef, { emotion: mappedEmotion });
                        }else{
                            console.log(`No playlist found for emotion: ${mappedEmotion}`);
                            await updateDoc(docRef, {emotion:''});
                        }
                    } else {
                        console.log(`Same Emotion detected (${mappedEmotion}), no action taken.`);
                    }
                } else {
                    await updateDoc(docRef, { emotion: '' });
                }
            } else {
                await updateDoc(docRef, { emotion: '' });
            }
        }
    });
}


async function redirectToSpotify(playlistUri) {
    // Retrieve token from localStorage
    let access_token = localStorage.getItem("spotify_access_token");

    if (!access_token) {
        console.error("No Spotify token found. Please log in.");
        return;
    }
    //console.log("Access Token: ",access_token);

    try {
        console.log(`Attempting to change Spotify playlist to: ${playlistUri}`);

        if (!playlistUri.startsWith("spotify:playlist:")) {
            console.error("Invalid playlist URI:", playlistUri);
            return;
        }

        // Step 1: Get the active Spotify device
        const devicesResponse = await fetch("https://api.spotify.com/v1/me/player/devices", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            }
        });

        const devicesData = await devicesResponse.json();
        if (!devicesData.devices || devicesData.devices.length === 0) {
            console.error("No active Spotify devices found! Please open Spotify.");
            return;
        }

        // Select the first active device
        const deviceId = devicesData.devices[0].id;
        console.log(`Using Spotify device: ${deviceId}`);

        
        console.log("Spotify player found!");
    } catch (error) {
        console.error("Error changing Spotify playlist:", error);
    }
}



// async function createPlaylist(songList) {
//     // create playlist
//     var playlist;
//     await fetch("https://api.spotify.com/v1/me/playlists", {
//         method: "POST", 
//         headers: { Authorization: `Bearer ${access_token}` },
//         body: JSON.stringify({ name: 'EmoTunes Playlist'})
//     }).then(r => r.json())
//     .then(r => {
//         playlist = r.id;
//         updateDoc(docRef, {playlist: r.id});
//     })
//     .then(r => {
//         // add music to playlist
//         fetch(`https://api.spotify.com/v1/playlists/${playlist}/tracks`, {
//             method: "POST", 
//             headers: { Authorization: `Bearer ${access_token}` },
//             body: JSON.stringify({uris: songList})
//         }).then(x => x.json())
//         .then(x => console.log(x));
//     });
// }




function SpotifyEmbed() {
    const [emotion, setEmotion] = React.useState('');
    const [playlistUri, setPlaylistUri] = React.useState(''); // Tracks playlist URI
    const emoticon = {
        'HAPPY': <SentimentSatisfiedAlt />,
        'SAD': <SentimentVeryDissatisfied />,
        'FEAR': <SentimentVeryDissatisfied />,
        'CALM': <SentimentSatisfied />,
        'CONFUSED': <SentimentDissatisfied />,
        'ANGRY': <MoodBad />,
        'DISGUSTED': <MoodBad />,
        'SURPRISED': <SentimentSatisfiedAlt />
    };

    

    // const changeSpotifyTrack = async (playlistUri) => {
    //     try {
    //         const response = await fetch("https://api.spotify.com/v1/me/player/play", {
    //             method: "PUT",
    //             headers: {
    //                 "Authorization": `Bearer ${access_token}`,
    //                 "Content-Type": "application/json"
    //             },
    //             body: JSON.stringify({
    //                 context_uri: playlistUri, // Play the whole playlist
    //                 offset: { position: 0 },  // Start from the first track
    //                 position_ms: 0
    //             })
    //         });

    //         if (!response.ok) {
    //             throw new Error(`Failed to change the song: ${response.statusText}`);
    //         }

    //         console.log("Song changed successfully on Spotify!");
    //         setPlaylistUri(playlistUri);
    //     } catch (error) {
    //         console.error("Error changing song:", error);
    //     }
    // };



    const getDocSnap = async () => {
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const docData = docSnap.data();
                const detectedEmotion = docData.emotion || '';
    
                // Retrieve user's stored playlists from Firebase
                const userPlaylists = docData.user_preferences || {};
    
                if (detectedEmotion !== emotion) {
                    console.log(`Current Emotion 2: ${detectedEmotion}`);
                    setEmotion(detectedEmotion); // Update emotion state
                    
                    // Get the correct playlist for the detected emotion
                    // const mappedEmotion = emotionMapping[detectedEmotion.toUpperCase()] || "bored";
                    const newPlaylistUri = userPlaylists[detectedEmotion];
                    console.log(`New playlist: ${newPlaylistUri}`);
                    console.log(`current playlist: ${playlistUri}`);
                    if (newPlaylistUri){
                        if (newPlaylistUri != playlistUri){
                            await changeSpotifyTrack(newPlaylistUri);
                        }
                        else {
                            console.log(`No new emotion detected`)
                        }
                    } 
                    else {
                        console.log(`No saved playlist found for emotion: ${detectedEmotion}`);
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching emotion data:", error);
        }
    };
    
    

    React.useEffect(() => {
        const intervalId = setInterval(() => {
            getDocSnap();
        }, 10000);
        return () => clearInterval(intervalId);
    }, [emotion]); // Depend on `emotion`, so it updates correctly

    return (
        <div>
            <div style={{ display: 'flex' }}>
                <p>You are currently feeling: &ensp;</p>
                <div style={{ alignSelf: 'center' }}>
                    {emotion ? (
                        <>
                            {emoticon[emotion]} {emotion}
                        </>
                    ) : (
                        <span>Loading emotion...</span>
                    )}
                </div>
            </div>
        </div>
    );
}




