// MongoDB adapter — same contract as the SQL adapters (find/findOne/count/insert/update/remove)
// even though the storage model is document-based. `id` is normalized to/from Mongo's `_id`
// (ObjectId) so app-level models never have to special-case Mongo vs SQL primary keys.
const { MongoClient, ObjectId } = require('mongodb');

let client;
let database;

async function connect() {
  if (database) return database;
  client = new MongoClient(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017');
  await client.connect();
  database = client.db(process.env.MONGO_DB_NAME || 'forge_mvc');
  return database;
}

function toObjectId(value) {
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string' && ObjectId.isValid(value)) return new ObjectId(value);
  return value;
}

// Regex metacharacters in user input would otherwise be interpreted — someone searching for
// "a.b" should not match "axb", and an unbalanced "(" would throw rather than find nothing.
function escapeRegex(term) {
  return String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Translates a plain-object filter into Mongo's shape: {id: 5} -> {_id: ObjectId(5)}, and the
// same {fields, term} search contract the SQL adapters use into a case-insensitive $or/$regex.
function normalizeFilter(where = {}, search = null) {
  const filter = { ...where };
  if ('id' in filter) {
    filter._id = toObjectId(filter.id);
    delete filter.id;
  }

  if (search && search.term && Array.isArray(search.fields) && search.fields.length) {
    const pattern = new RegExp(escapeRegex(search.term), 'i');
    filter.$or = search.fields.map((f) => ({ [f]: pattern }));
  }

  return filter;
}

// Translates a Mongo document back into the {id, ...} shape SQL rows already use.
function normalizeDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest };
}

async function query() {
  throw new Error('mongodb adapter has no raw SQL query() — use findWhere/findOne or db.collection(name) directly for aggregation pipelines.');
}

async function findWhere(collectionName, where = {}, { limit, offset, orderBy, search = null } = {}) {
  const db = await connect();
  let cursor = db.collection(collectionName).find(normalizeFilter(where, search));
  if (orderBy) {
    const [field, dir] = String(orderBy).split(' ');
    cursor = cursor.sort({ [field === 'id' ? '_id' : field]: /desc/i.test(dir || '') ? -1 : 1 });
  }
  if (offset) cursor = cursor.skip(Number(offset));
  if (limit != null) cursor = cursor.limit(Number(limit));
  const docs = await cursor.toArray();
  return docs.map(normalizeDoc);
}

async function findOne(collectionName, where = {}) {
  const db = await connect();
  const doc = await db.collection(collectionName).findOne(normalizeFilter(where));
  return normalizeDoc(doc);
}

async function count(collectionName, where = {}, { search = null } = {}) {
  const db = await connect();
  return db.collection(collectionName).countDocuments(normalizeFilter(where, search));
}

async function insert(collectionName, data) {
  const db = await connect();
  const now = new Date();
  const result = await db.collection(collectionName).insertOne({ ...data, created_at: data.created_at || now, updated_at: now });
  return findOne(collectionName, { id: result.insertedId });
}

async function update(collectionName, id, data) {
  const db = await connect();
  await db.collection(collectionName).updateOne({ _id: toObjectId(id) }, { $set: { ...data, updated_at: new Date() } });
  return findOne(collectionName, { id });
}

async function remove(collectionName, id) {
  const db = await connect();
  const result = await db.collection(collectionName).deleteOne({ _id: toObjectId(id) });
  return result.deletedCount > 0;
}

module.exports = { driver: 'mongodb', connect, query, findWhere, findOne, count, insert, update, remove, toObjectId, normalizeDoc };
