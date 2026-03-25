async function run() {
  const res = await fetch('https://raw.githubusercontent.com/pinterest/api-description/main/v5/openapi.yaml');
  const text = await res.text();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('schedule')) {
      console.log(`Line ${i+1}: ${lines[i]}`);
    }
  }
}
run();
