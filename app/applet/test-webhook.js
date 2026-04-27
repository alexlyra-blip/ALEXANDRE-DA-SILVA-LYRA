const body = new URLSearchParams();
body.append("From", "whatsapp:+5511999999999");
body.append("Body", "Oi");

fetch("http://localhost:3000/api/whatsapp-twilio", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded"
  },
  body: body.toString()
})
.then(async r => {
  console.log("Status:", r.status);
  console.log("Response:", await r.text());
})
.catch(e => console.error(e));
