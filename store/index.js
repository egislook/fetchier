import { createContext, useState, useEffect, useContext } from 'react';
import fetchier, { GET, POST, PUT, GQL, WS } from 'fetchier';
import config, { GQL_URL, WSS_URL, endpoints } from '../data/config';
import actions from './actions';
import Cookies from 'js-cookie';
import queries from '../data/graphqlQueries';

const context = createContext(null);
const defaultStatus = { loading: null, info: null, confirm: null, update: null };

export function GlobalProvider(props){
  
  const { children, router, init } = props;
  delete props.children;
  
  const [status, setGlobalStatus] = useState({ ...defaultStatus, loading: true });
  let [global, setGlobalStore] = useState({ token: Cookies.get('token') });
  
  const handlers = {
    loading: setLoading,
    info: handleInfo,
    clear: handleClear,
    confirm: handleConfirm,
  };
  
  useEffect(() => { console.log('APP_INIT'); act('APP_INIT') }, [Cookies.get('token')]);
  
  const values = { 
    ...props, 
    status, 
    ...global,
    act: act.bind(handleInfo), 
    action: action.bind(handleInfo),
    handle: handlers,
    store: {
      get: getGlobal,
      set: setGlobal
    },
    route: {
      get: (str) => str ? router.asPath.includes(str) : router.asPath,
      set: setRoute
    }
  }
  
  useActions(actions, values);

  return (<context.Provider children={children} value={values} />);

  // Setters

  function setRoute(name, disableRoute){
    const route = init.routes[name] || { link: router.query.redirect || name };
    
    return new Promise( resolve => {
      if(disableRoute || router.asPath === (route.link || name ))
        return resolve(route)
      
      router.events.on('routeChangeComplete', (url) => {
        router.events.off('routeChangeComplete');
        return resolve(url);
      });
      router.push(route.link, route.link, { shallow: true });
    })
  }
  
  function setLoading(loading){
    status.loading !== loading && setGlobalStatus({ ...defaultStatus, loading })
  }
  
  function getGlobal(singleKey){
    const keys = [...arguments];
    if(!keys.length)
      return global;
    if(keys.length === 1)
      return global[singleKey];
      
    return keys.reduce((res, key) => Object.assign(res, { [key]: global[key] }), {});
  }
  
  function handleClear(update = new Date().getTime()){
    setGlobalStatus({ ...defaultStatus, update })
  }
  
  function setGlobal(data, noUpdate){
    
    if(data){
      for(let key in data){
        global[key] = data[key];
      }
    } else {
      global = {};
    }
    
    console.log({ data, global })
      
    setGlobalStore(!data ? {} : global);
    handleClear();
    return Promise.resolve(data);
  }
  
  function handleConfirm(action){
    if(!action || (action && typeof status.confirm !== 'function'))
      return setGlobalStatus({ ...defaultStatus, confirm: action });
    
    status.confirm();
    return setGlobalStatus({ ...defaultStatus, confirm: null });
  }
  
  function handleInfo(data){
    return setGlobalStatus({ ...defaultStatus, info: data && data.message || JSON.stringify(data) })
  }
  
}

GlobalProvider.context = context;

// Hooks

export function useActions(fn, globalContext){
  const state = { config, ...(globalContext || useContext(context) || {}) };
  const actions = fn(state);
  
  if(!GlobalProvider.actions)
    GlobalProvider.actions = {};
    
  const firstActionName = Object.keys(actions).shift();
  if(GlobalProvider.actions[firstActionName])
    return state;
    
  for(let actionName in actions){
    GlobalProvider.actions[actionName] = actions[actionName].bind(state.set);
  }
  
  return state;
}

export const useGlobal = (cfg = {}) => {
  const { actions } = cfg;
  const globalContext = useContext(context);
  
  if(actions) useActions(actions, globalContext);
  return globalContext;
}

export function action(actionName){
  const actions = GlobalProvider.actions;
  
  if(typeof actionName !== 'string' || !actions[actionName])
    return Promise.reject(actionName + ' action can not be found');
  
  return function(){ return actions[actionName].apply(null, arguments) }
}

export function act(){
  const args = [...arguments];
  const actionName = args.shift();
  const actions = GlobalProvider.actions;
  
  const handleError = (error) => {
    console.warn(error);
    return this && this(error);
  }
    
  if(typeof actionName === 'function')
    return actionName.apply(null, arguments);
  
  if(typeof actionName === 'string'){
    const actFunction = actions[actionName] ? actions[actionName](...args) : getRequestPromise.apply(null, arguments);
    return typeof actFunction === 'object' ? actFunction.catch(handleError) : Promise.resolve(actFunction);
  }
    
  if(Array.isArray(actionName))
    return Promise.all(actionName.map(request => 
      typeof request === 'string' 
        ? act(request) 
        : typeof request === 'object' ? getRequestPromise(null, request) : request
      )
    ).catch(handleError)
    
  return handleError(actionName + ' action is missing correct actionName as first parameter')
}

function getRequestPromise(actionName, request){
  let { method, endpoint, path, req } = request || {};
  req = {
    method: actionName || req && req.method || method || 'GET',
    endpoint: req && req.endpoint || endpoint,
    path: req && req.path || path || '',
    ...(req || request)
  }
  
  const token = Cookies.get('token');
  
  switch(req.method){
    case 'GQL':
    case 'POST':
    case 'GET':
      const url = req.method === 'GQL' ? GQL_URL : endpoints[endpoint] + req.path;
      return fetchier[req.method]({ url, token, ...req });
    case 'OPEN':
      return WS.OPEN({ url: WSS_URL, token, ...req });
    case 'CLOSE':
      return WS.CLOSE({ url: WSS_URL, ...req });
    case 'PUT':
      return PUT({ ...req });
    case 'SUB':
      return WS.SUB({ url: req.url || WSS_URL, subscription: req });
    case 'UNSUB':
      return WS.UNSUB({ url: WSS_URL, ...req });
  }
  
  return Promise.reject('Incorrect action ' + actionName);
}

export default context;