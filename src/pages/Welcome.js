
import React from "react";
import MultiSelect from '../components/MultiSelectPreference.js';
import { LoginAppBar } from '../components/AppBar.js';
import { Button } from '@mui/material';
import { addDocumentField } from '../firebase/SubmitData.js';
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "../firebase/Firebase.js";

//const params = new URLSearchParams(window.location.hash.substring(1));
//var access_token = params.get("access_token");
var access_token = localStorage.getItem("spotify_access_token");
console.log("2nd ", access_token);

export default function Welcome(props) {
    const params = new URLSearchParams(window.location.hash);
    var state = params.get("state").split('/');
    var username = state[1];
    var id = state[0];

    return (
        <body>
            <LoginAppBar />
            <div style={{ margin: '25px' }}>
                <div><strong>Hi {username}, please select your music preferences!</strong></div>
                <br />
                <PreferenceForm doc_id={id} username={username} />
            </div>
        </body>
    );
}

function PreferenceForm(props) {
    const { doc_id, username } = props;
    const [playlists, setPlaylists] = React.useState([]); // Store playlists
    const [selectedMood, setSelectedMood] = React.useState(""); // Store selected mood
    const [customPlaylists, setCustomPlaylists] = React.useState(() => {
        return JSON.parse(localStorage.getItem("customPlaylists")) || {};
    });

    // Fetch playlists when the component loads
    React.useEffect(() => {
        async function loadPlaylists() {
            const fetchedPlaylists = await fetchUserPlaylists();
            setPlaylists(fetchedPlaylists);
        }
        loadPlaylists();
    }, []);

    const handlePlaylistChange = (mood, playlistId) => {
    if (!playlistId) return;
    
    const playlistUri = `spotify:playlist:${playlistId}`; // Convert to Spotify URI format
    
    setCustomPlaylists((prev) => {
        const updated = { ...prev, [mood]: playlistUri };
        localStorage.setItem("customPlaylists", JSON.stringify(updated));
        return updated;
    });
};

    const openSpotifyToCreatePlaylist = async () => {
        let access_token = localStorage.getItem("spotify_access_token");
    
        if (!access_token) {
            console.error("No Spotify token found. Please log in.");
            alert("No Spotify token found. Please log in to Spotify first.");
            return;
        }
    
        if (!selectedMood) {
            alert("Please select a mood before creating a playlist!");
            return;
        }
    
        try {
            // Check Firebase for an existing playlist
            const docRef = doc(firestore, "test_data", doc_id);
            const docSnap = await getDoc(docRef);
    
            let userPreferences = {};
    
            if (docSnap.exists()) {
                userPreferences = docSnap.data().user_preferences || {};
                if (userPreferences[selectedMood]) {
                    console.log(`Playlist for ${selectedMood} already exists! Redirecting...`);
                    //window.open(userPreferences[selectedMood], "_blank"); // Redirect to existing playlist
                    window.location.href = userPreferences[selectedMood];
                    return;
                }
            }
            
            const presetSongsRef = doc(firestore,"test_data", doc_id);
            const presetSongsSnap = await getDoc(presetSongsRef);

            let presetPlaylistUri = "";

            if (presetSongsSnap.exists()) {
                presetPlaylistUri = presetSongsSnap.data().playlist_uri; // Retrieve preset playlist URI
            }
    
            if (!presetPlaylistUri) {
                alert(`No preset playlist found for ${selectedMood}.`);
                return;
            }
    
            console.log(`Preset playlist for ${selectedMood}: ${presetPlaylistUri[selectedMood]}`);
    
            // Extract playlist ID from URI (format: spotify:playlist:<playlist_id>)
            const presetPlaylistId = presetPlaylistUri[selectedMood].split(":").pop();
            console.log(presetPlaylistId);
    
            // Step 3: Fetch tracks from the preset playlist
            const tracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${presetPlaylistId}/tracks`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json"
                }
            });
    
            if (!tracksResponse.ok) {
                throw new Error(`Failed to fetch tracks from preset playlist: ${tracksResponse.statusText}`);
            }
    
            const tracksData = await tracksResponse.json();
            let trackUris = tracksData.items.slice(0, 5).map(item => item.track.uri); // Get top 5 tracks
    
            console.log(`Top 5 tracks for ${selectedMood}:`, trackUris);
            
    
            // Step 1: Get the user's Spotify ID
            const userResponse = await fetch("https://api.spotify.com/v1/me", {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json"
                }
            });
    
            if (!userResponse.ok) {
                throw new Error(`Failed to fetch user info: ${userResponse.statusText}`);
            }
    
            const userData = await userResponse.json();
            const userId = userData.id;
            console.log("User ID:", userId);
    
            // Step 2: Create a mood-based playlist
            const playlistName = `${selectedMood} Vibes Playlist`;
            const playlistDescription = `A mood-based playlist for when you're feeling ${selectedMood}`;
    
            const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    name: playlistName,
                    description: playlistDescription,
                    public: false
                })
            });
    
            if (!playlistResponse.ok) {
                throw new Error(`Failed to create playlist: ${playlistResponse.statusText}`);
            }
    
            const playlistData = await playlistResponse.json();
            console.log("Created Playlist:", playlistData);
            
            // Step 3: Merge the new playlist into existing Firebase data
            const playlistUri = playlistData.uri;
            userPreferences[selectedMood] = playlistUri; // Update only the selected mood

            // Save the updated preferences
            await addDocumentField("test_data", userPreferences, "user_preferences", doc_id);

            if (trackUris.length > 0) {
                await fetch(`https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${access_token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        uris: trackUris
                    })
                });
    
                console.log(`Added ${trackUris.length} songs to the new playlist.`);
            }

            // Step 4: Open the playlist in Spotify
            //window.open(playlistUri, "_blank");
            window.location.href = playlistUri;
    
            // Step 5: Refresh user's playlist list
            setTimeout(() => fetchUserPlaylists().then(setPlaylists), 5000);
        } catch (error) {
            console.error("Error creating Spotify playlist:", error);
            alert("Something went wrong while creating the playlist. Please try again.");
        }
    };


    const redirect = () => {
        window.location.href = "./Work#access_token=" + access_token + "&state=" + doc_id + '/' + username;
    };

    const submithandler = async (e) => {
        e.preventDefault();
        
        // Ensure that Firebase saves the Spotify URI, not just the ID
        const savedPlaylists = Object.fromEntries(
            Object.entries(customPlaylists).map(([mood, id]) => [mood, id]) // id is already in URI format
        );
    
        await addDocumentField("test_data", savedPlaylists, 'user_preferences', doc_id);
        
        console.log("User Preferences Saved!");
        redirect();
    };
    

    return (
        <div className="login">
            <h2>🎵 Customize Your Mood Playlists 🎵</h2>

            {/* Mood Selection */}
            <label>Select Mood for Playlist:</label>
            <select value={selectedMood} onChange={(e) => setSelectedMood(e.target.value)}>
                <option value="">Select a mood...</option>
                {["happy", "sad", "concentrating", "stress", "angry", "bored"].map((mood) => (
                    <option key={mood} value={mood}>
                        {mood}
                    </option>
                ))}
            </select>

            {/* Button to create a playlist in Spotify */}
            <Button onClick={openSpotifyToCreatePlaylist}>
                ➕ Create a Playlist on Spotify
            </Button>

            {/* Playlist Selection for Different Moods */}
            {["happy", "sad", "concentrating", "stressed", "angry", "bored"].map((mood) => (
                <div key={mood}>
                    <label>{mood.charAt(0).toUpperCase() + mood.slice(1)} Playlist:</label>
                    <select onChange={(e) => handlePlaylistChange(mood, e.target.value)}>
                        <option value="">Select a playlist...</option>
                        {playlists.map((playlist) => (
                            <option key={playlist.id} value={playlist.id}>
                                {playlist.name}
                            </option>
                        ))}
                    </select>
                </div>
            ))}

            <Button type="submit" onClick={submithandler}>Save Preferences</Button>
        </div>
    );
}



/** Fetch user's playlists from Spotify */
async function fetchUserPlaylists() {
    let access_token = localStorage.getItem("spotify_access_token");

    if (!access_token) {
        console.error("No Spotify token found. Please log in.");
        return [];
    }

    try {
        const response = await fetch("https://api.spotify.com/v1/me/playlists", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${access_token}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            throw new Error(`Spotify API Error: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Convert each playlist's ID to its URI format before returning
        return data.items.map(playlist => ({
            id: playlist.id,  // Keep ID for selection
            name: playlist.name,
            uri: `spotify:playlist:${playlist.id}` // Convert ID to Spotify URI
        }));
    } catch (error) {
        console.error("Error fetching Spotify playlists:", error);
        return [];
    }
}

