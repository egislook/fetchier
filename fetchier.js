const fetch = require('node-fetch');

module.exports.GQL = GQL;
module.exports.GET = GET;
module.exports.POST = POST;
module.exports.wsGQL = wsGQL;
module.exports.fetch = fetch;

let webSocket;

const GQL_URL = 'https://api.graph.cool/simple/v1/';
const WSS_URL = 'wss://subscriptions.ap-northeast-1.graph.cool/v1/';
const WSS_PROTOCOL = 'graphql-subscriptions';

async function GET({ url, body, method = 'GET', debug }){
  
  if(!url) 
    throw new Error('url is missing');
    
  try{
    const res = await fetch(url, { method, body: JSON.stringify(body) });
    const json = await res.json();
    debug && console.log('Fetchier GET:', { json });
    return json;
  } catch(error){ throw error }
}

async function POST({ url, body = {}, nocors, contentTypeForm, debug }){
  
  if(!url) 
    throw new Error('url is missing');
  
  const opts = {
    method: 'POST',
    mode: nocors ? 'no-cors' : 'cors',
    headers: { 'Content-Type': !contentTypeForm ? 'application/json; charset=utf-8' : 'application/x-www-form-urlencoded' },
    body: JSON.stringify(body)
  }
  
  try{
    const res = await fetch(url, opts);
    const json = await res.json();
    debug && console.log('Fetchier POST:', { json, body });
    return json;
  } catch(error){ throw error }
}

async function GQL({ query, GQ, url, token, variables, debug }){
  GQ = typeof ENV === 'object' && ENV.GQ || GQ;
  
  url = url || GQL_URL + GQ;
  
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

function wsGQL({ GQ, token, url, queries = [], action, debug }, cb) {
  GQ = typeof ENV === 'object' && ENV.GQ || GQ;
  
  if(webSocket){
    console.log('WebSocket is already open');
    return Promise.resolve(webSocket);
  }
  
  url = url || WSS_URL + GQ;
  
  webSocket = new WebSocket(WSS_URL + GQ, WSS_PROTOCOL);
  
  webSocket.onopen = e => {
    webSocket.send(JSON.stringify({
      type: 'init',
      payload: {
        Authorization: `Bearer ${token}`
      }
    }))
  }
  
  // webSocket.onclose = () => {
  //   isSocketConnected = false;
  //   webSocket.close() // disable onclose handler first
  // }
  
  webSocket.onmessage = e => {
    const data = JSON.parse(e.data);
    
    switch(data.type){
      
      case 'init_success':
        debug && console.log('Fetchier wsGQL:', 'socket connected', { queries });
        queries.forEach( (query, id) => {
          webSocket.send(
            JSON.stringify({
              id,
              type: 'subscription_start',
              query
            })
          )
        });
        
        return cb && cb(webSocket);
      break;
      
      case 'subscription_data':
        const payload = data.payload.data;
        debug && console.log('Fetchier wsGQL:', { payload });
        const keys = Object.keys(payload);
        action && action(keys.length && payload[keys.shift()])
      break;
      
      case 'init_fail': 
        return cb && cb(false, {
          message: 'init_fail returned from WebSocket server',
          data
        })
    }
  }
}