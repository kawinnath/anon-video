const bucket = "kawinnath-ef1c6.appspot.com";
const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=anonvideos/test.txt`;

async function testUpload() {
  try {
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: "Hello from Antigravity test script!"
    });
    
    if (response.ok) {
      console.log("SUCCESS! Firebase Storage rules are OPEN.");
    } else {
      const errorText = await response.text();
      console.log(`FAILED! HTTP ${response.status}`);
      console.log(`ERROR: ${errorText}`);
    }
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testUpload();
