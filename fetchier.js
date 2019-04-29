const fetch = require('node-fetch');

module.exports.GQL = GQL;
module.exports.GET = GET;
module.exports.POST = POST;
module.exports.PUT = PUT;
module.exports.wsGQL = wsGQL;
module.exports.fetch = fetch;
module.exports.wsGQLSubscribe = wsGQLSubscribe;
module.exports.wsGQLclose = wsGQLclose;

let webSockets = {};
let webSocketSubscriptions = {};

const GQL_URL = 'https://api.graph.cool/simple/v1/';
const WSS_URL = 'wss://subscriptions.ap-northeast-1.graph.cool/v1/';
const WSS_PROTOCOL = 'graphql-ws';
const WSS_PROTOCOL_OLD = 'graphql-subscriptions';

async function GET({ url, body, method = 'GET', headers = {}, debug }){
  
  if(!url) 
    throw new Error('url is missing');
    
  try{
    const res = await fetch(url, { method, body: JSON.stringify(body), headers });
    const json = await res.json();
    
    if(res && res.status !== 200)
      throw json;
    
    debug && console.log('Fetchier GET:', { json });
    return json;
  } catch(error){ throw error }
}

async function POST({ url, body = {}, nocors, contentTypeForm, jsonBody = true, token, headers = {}, debug }){
  
  if(!url) 
    throw new Error('url is missing');
  
  const opts = {
    method: 'POST',
    mode: nocors ? 'no-cors' : 'cors',
    headers: { 
      'content-type': !contentTypeForm ? 'application/json' : 'application/x-www-form-urlencoded',
      ...(token && {'authorization':  `Bearer ${token}`} || {}),
      ...headers
    },
    body: jsonBody ? JSON.stringify(body) : body
  }
  
  try{
    const res = await fetch(url, opts);
    const json = await res.json();
    
    if(res && res.status !== 200)
      throw json;
      
    debug && console.log('Fetchier POST:', { json, body });
    return json;
  } catch(error){ throw error }
}

async function PUT({ url, body, method = 'PUT', jsonBody, headers = {}, debug}){
  if(!url) 
    throw new Error('url is missing');
  
  body = jsonBody ? JSON.stringify(body) : body;
  
  try{
    const res = await fetch(url, { method, body, headers });
    // const json = await res.json();
    if(res && res.status !== 200)
      throw res;
    
    debug && console.log('Fetchier PUT:', res);
    return res;
  } catch(error){ throw error }
  
}

async function GQL({ query, GQ, url, token, variables, headers = {}, debug }){
  GQ = typeof ENV === 'object' && ENV.GQ || GQ;
  
  url = url || GQL_URL + GQ;
  
  const opts = {
    method: 'POST',
    headers: { 
      'content-type': 'application/json',
      ...(token && {'authorization':  `Bearer ${token}`} || {}),
      ...headers
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

function wsGQL({ GQ, token, url, protocolOld, debug }, cb) {
  GQ = typeof ENV === 'object' && ENV.GQ || GQ;
  
  if(webSockets[url]){
    console.log(`WebSocket ${url} is already open`);
    return Promise.resolve(webSockets[url]);
  }
  
  url = url || WSS_URL + GQ;
  
  webSockets[url] = new WebSocket(url, protocolOld ? WSS_PROTOCOL_OLD : WSS_PROTOCOL);
  webSocketSubscriptions[url] = {};
  
  webSockets[url].onopen = e => {
    // send handshake
    webSockets[url].send(JSON.stringify({
      type: protocolOld ? 'init' : 'connection_init',
      payload: {
        Authorization: `Bearer ${token}`,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        }
      }
    }))
  }
  
  // webSocket.onclose = () => {
  //   isSocketConnected = false;
  //   webSocket.close() // disable onclose handler first
  // }
  return new Promise( (resolve, reject) => {
  
    webSockets[url].onmessage = e => {
      const data = JSON.parse(e.data);
      
      debug && console.log(data.type);
      
      switch(data.type){
        
        case 'init_success':
        case 'connection_ack':
          debug && console.log('Fetchier wsGQL:', url, 'socket connected');
          // queries && wsGQLSubscribe({ url, queries });
          return resolve(webSockets[url]);
          // return cb && cb(webSockets[url]);
        break;
        
        case 'subscription_data':
        case 'data':
          const payload = data.payload.data;
          debug && console.log('Fetchier wsGQL:', { payload }, data);
          const keys = Object.keys(payload);
          
          const action = webSocketSubscriptions[url][data.id];
          action && action(keys.length && payload[keys.shift()])
        break;
        
        case 'init_fail':
        case 'connection_error':
          return reject(data.payload);
          // return cb && cb(false, {
          //   message: 'init_fail from WebSocket',
          //   data
          // })
      }
    }
    
  });
}

function wsGQLSubscribe({ url, subscription, debug }){
  
  return subscribe(subscription);
  
  function subscribe({id, query, action, variables}){
    if(!webSocketSubscriptions[url])
      return console.warn('Fetchier wsGQLSubscribe', `"${id}"`, 'can not subscribe without existing socket', url);
    if(webSocketSubscriptions[url][id]) 
      return console.warn('Fetchier wsGQLSubscribe', `"${id}"`, 'subscription already exists');
    
    webSocketSubscriptions[url][id] = action;
    const payload = { id: String(id), type: 'start', payload: { query, variables } };
    if(!webSockets[url]) return;
    webSockets[url].send(JSON.stringify(payload));
    return debug && console.log('Fetchier wsGQLSubscribe start', id, url, payload);
  }
  
  // queries.forEach( (query, id) => {
  //   const payload = { id: String(id), type: 'start', payload: { query } };
  //   debug && console.log('Fetchier wsGQLSubscribe', { url, payload });
  //   if(!webSockets[url]) return;
  //   webSockets[url].send(JSON.stringify(payload));
  // });
  
  return;
}

function wsGQLUnsubscribe({ url, id, debug }){
  delete webSocketSubscriptions[url][id];
  webSockets[url].send(JSON.stringify({ type: 'stop', id: String(id) }));
  return debug && console.log('Fetchier wsGQLSubscribe start', id, url);
}

function wsGQLclose(props = {}){
  if(props.url && webSockets[props.url]){
    webSockets[props.url].close();
    delete webSockets[props.url];
    delete webSocketSubscriptions[props.url];
    return;
  }
  
  for( let url in webSockets ){
    webSockets[url].close();
    delete webSockets[url];
    delete webSocketSubscriptions[url];
  }
  
  return;
}