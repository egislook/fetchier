/** Example
 * const req = useUpsert({ 
      data: { loyalty }, 
      prev: state,
      // opts: {
      //   loyalty: { 
      //     table: 'Loyalties', 
      //     columns: ['expireIn', 'name'],
      //     prev: state.loyalty
      //   },
      //   openingHours: {
      //    type: 'JSONB'
      //   }
      // }
    });
 * 
 */
 
module.exports.upsert = upsert;
module.exports.diff = getDiff;
module.exports.constraint = getConstraints;

function upsert({ data, prev, opts, returning = 'id' }){
  const structure = getStructure(prev && getDiff(data, prev) || data, opts, prev)
  const pkey = Object.keys(structure).shift();
  const query = getQuery(structure[pkey], returning, opts && opts.schema)
  const variables = { ...structure[pkey] }
  
  return query && variables && { query, variables };
}

function getQuery(structure, returning, schema){
  if(!structure) return
  const { data, on_conflict } = structure;
  let table = on_conflict.constraint.replace('_pkey', '')
  if(schema) table = [schema, table].join('_')
  return `mutation ($data: [${table}_insert_input!]!, $on_conflict: ${table}_on_conflict) {
    insert_${table}(
      objects: $data, 
      on_conflict: $on_conflict
    ) { affected_rows ${returning ? `returning {${returning}}`: ''} }
  }`
}

function getStructure(obj, opts = {}, prevData = {}){
  const res = Object.keys(obj).map(field => {
    
    const isArray = Array.isArray(obj[field]);
    
    if(!obj[field] || typeof obj[field] !== 'object')
      return {[field]: obj[field]}
    
    const { table, columns, key, prev } = getConstraints(field, !isArray ? obj[field] : obj[field][0], opts[field], prevData && prevData[field]);
    const data = getStructure(obj[field], opts, prevData[field] || {});
    
    if(!Object.keys(data).length) return
    if(prev && prev.id) data.id = prev.id
    return {
      [setTail(field)]: { 
        data,
        on_conflict: { 
          constraint: `${table}_${key}`, 
          update_columns: columns 
        }
      }
    }
  })
  
  if(Array.isArray(obj))
    return res.reduce((a, item, key) => a.concat([item[key].data]), [])
  
  return res.reduce((o, item) => Object.assign(o, item), {})
}

function setTail(field, tail = 's'){
  if((parseInt(field) + '') === field)
    return field
  const lastChar = field.substr(-1);
  return lastChar === 's' 
    ? field
    : lastChar === 'y' ? field.slice(0, -1) + 'ies' : field + tail;
}

function getConstraints(field, obj, opts = {}, prev){
  field = setTail(field);
  const columns = Object.keys(obj).filter(key => !obj[key] || typeof obj[key] !== 'object' ).concat(['id']);
  return {
    table: field.charAt(0).toUpperCase() + field.slice(1),
    columns: [...new Set(columns)],
    key: 'pkey',
    prev,
    ...opts
  }
}

function getDiff (data = {}, prev = {}) {
  const obj = {}
  Object.keys(data).map( key => {
    
    // console.log({ key: key, prev: prev[key], next: data[key] });
    
    if(typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])){
      const res = getDiff(data[key] || {}, prev[key] || {})
      if(Object.keys(res).length) obj[key] = res
      return;
    }
    
    // if(key === 'id')
    //   return obj[key] = data[key] === undefined ? prev[key] : data[key]
    
    Array.isArray(data[key])
      return obj[key] = data[key]
    
    if(data[key] !== prev[key] && data[key] !== undefined)
      return obj[key] = data[key]
      
  })
  return obj
}