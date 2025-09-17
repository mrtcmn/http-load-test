const port = process.env.PORT || 8001;

const server = Bun.serve({
  port: port,
  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/test') {
      if (request.method === 'GET') {
        // todo Write to database or processing
        console.log('Get test');
        
        // Content-Type: application/json
        return new Response(JSON.stringify({"dc": "Success", "rc": 100}), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      if (request.method === 'POST') {
        // todo Write to database or processing
        console.log('Post test');
        
        try {
          const body = await request.json();
          console.log(body);
        } catch (error) {
          console.log('Error parsing JSON body:', error);
        }
        
        console.log(Object.fromEntries(request.headers.entries()));
        
        // Content-Type: application/json
        return new Response(JSON.stringify({"dc": "Success", "rc": 100}), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    // Return 404 for other routes
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Example endpoint running! - ${port}!`);