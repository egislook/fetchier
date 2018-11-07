const fetch = require('node-fetch');

module.exports.GQL = GQL;
module.exports.GET = GET;
module.exports.wsGQL = wsGQL;
module.exports.fetch = fetch;

async function GET({ url, body, method = 'GET', debug }){
  if(!url) 
    throw new Error('url is missing');
    
  const res = await fetch(url, { method, body: JSON.stringify(body) });
  const json = await res.json();
  debug && console.log('Fetchier GET:', { json });
  return json;
}

async function GQL({ query, GQ, token, variables, debug }){
  GQ = typeof ENV === 'object' && ENV.GQ || GQ;
  
  const url = 'https://api.graph.cool/simple/v1/' + GQ;
  
  const opts = {
    method: 'POST',
    headers: { 
      'content-type': 'application/json',
      ...(token && {'authorization':  `Bearer ${token}`} || {})
    },
    body: JSON.stringify({ query, variables })
  }
  
  const res = await fetch(url, opts);
  const json = await res.json();
  
  debug && debug && console.log('Fetchier GQL:', json);
  
  if(json.errors){
    const error = json.errors.shift();
    throw error.functionError || error.message || error;
  }
  
  const keys = Object.keys(json);
  return keys.length && json[keys.shift()];
}

// function GQL({ query, GQ, token, variables, debug }){
//   GQ = typeof ENV === 'object' && ENV.GQ || GQ;
//   return fetch('https://api.graph.cool/simple/v1/' + GQ, {
//     method: 'POST',
//     headers: { 
//       'content-type':   'application/json',
//       ...(token && {'authorization':  `Bearer ${token}`} || {})
//     },
//     body: JSON.stringify({ query, variables })
//   })
//   .then( res => res.json() )
//   .then( json => {
//     if(json.errors){
//       const error = json.errors.shift();
        
//       throw error.functionError || error.message || error;
//     }
//     debug && console.log('From GQL', json);
//     return json.data 
//   })
//   .then( data => {
//     const keys = Object.keys(data);
//     return keys.length && data[keys.shift()];
//   })
//   .catch( error => {
//     console.warn(error);
//     return { error };
//   })
// }

function wsGQL({ GQ, token, queries = [], action, debug }) {
  GQ = typeof ENV === 'object' && ENV.GQ || GQ;
  
  const webSocket = new WebSocket('wss://subscriptions.ap-northeast-1.graph.cool/v1/' + GQ, 'graphql-subscriptions');
  
  webSocket.onopen = e => {
    webSocket.send(JSON.stringify({
      type: 'init',
      payload: {
        Authorization: `Bearer ${token}`
      }
    }))
  }
  
  webSocket.onmessage = e => {
    const data = JSON.parse(e.data);
    
    switch(data.type){
      
      case 'init_success':
        debug && console.log('Fetchier wsGQL:', 'socket connected', { queries });
        queries.forEach( (query, id) => webSocket.send(JSON.stringify({
          id,
          type: 'subscription_start',
          query
        })))
      break;
      
      case 'subscription_data':
        const payload = data.payload.data;
        debug && console.log('Fetchier wsGQL:', { payload });
        const keys = Object.keys(payload);
        action && action(keys.length && payload[keys.shift()])
      break;
      
      case 'init_fail': {
        throw {
          message: 'init_fail returned from WebSocket server',
          data
        }
      }
      
    }
  }
  
  return webSocket;
}