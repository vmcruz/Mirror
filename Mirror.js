/**
* @class Mirror
* @constructor
* @param {String} idbName The name of the database to be created or opened
* @property {String} idbName Holds the name of the database
* @property {Object} idbConnection Holds the active connection to the database
* @property {Object[]} storageData Holds the data of each storage. This is, all the objects of the current database
* @property {Object[]} storageConfig Holds the storage user-defined configuration
*/
var Mirror = function(idbName) {
	this.idbName = idbName;
	this.idbConnection = null;
	this.storageData = [];
	this.storageConfig = [];
}

/**
* @method createStorage
* @description Creates a new storage. Must be done before opening the database
* @param {String} name The name of the new storage
* @param {Object} opts Configuration of the storage: keyPath, autoIncrement, unique
*/
Mirror.prototype.createStorage = function(name, opts) {
	this.storageConfig[name] = opts;
}

/**
* @method open
* @description Opens a new connection to the specified database name in constructor
* @param {Function} onready User-defined callback function, takes one optional param which is a reference to this Mirror Object
*/
Mirror.prototype.open = function(onready) {
	var request = window.indexedDB.open(this.idbName);
	self = this;
	request.onupgradeneeded = function(e) {
		self.idbConnection = request.result;
		for(var storage in self.storageConfig)
			self.idbConnection.createObjectStore(storage, self.storageConfig[storage]);
	}
	
	request.onsuccess = function(e) {
		self.idbConnection = request.result;
		self.sync(onready);
	}
}

/**
* @method close
* @description Closes the current connection
*/
Mirror.prototype.close = function() {
	this.idbConnection.close();
}

/**
* @method drop
* @description Deletes the current database
*/
Mirror.prototype.drop = function() {
	window.indexedDB.deleteDatabase(this.idbName);
}

/**
* @method sync
* @description Synchronizes object storage holder with current database object storages
* @param {Function} oncomplete User-defined callback function, takes one optional param which is a reference to this Mirror Object
*/
Mirror.prototype.sync = function(oncomplete) {
	var storages = this.idbConnection.objectStoreNames;
	var counter = 0;
	
	for(var i = 0; i < storages.length; i++) {
		(function(self, storage) {
			var trans = self.idbConnection.transaction([storage], 'readonly').objectStore(storage);
			self.storageData[storage] = [];
			trans.openCursor().onsuccess = function(e) {
				var cursor = e.target.result;
				if(cursor) {
					self.storageData[storage].push(cursor.value);
					cursor.continue();
				} else {
					counter++;
					if(counter == self.idbConnection.objectStoreNames.length && oncomplete)
						oncomplete(self);
				}
			}
		})(this, storages[i]);
	}
}

/**
* @class Mirror.Storage
* @description Creates a new storage object
* @param {Object} mi The Mirror instance
* @param {String} name The storage you want to access
*/
Mirror.Storage = function(mi, name) {
	this.idbStorageName = name;
	this.storageData = mi.storageData[this.idbStorageName] || [];
	
	/**
	* @method getTransaction
	* @description Returns a new transaction to perform operations in selected object storage
	* @param {String} mode The mode of the transaction, can be either 'readwrite' or 'readonly'
	* @return {Oject} IDBTransaction
	*/
	this.getTransaction = function(mode) {
		return mi.idbConnection.transaction([this.idbStorageName], mode).objectStore(this.idbStorageName);
	}
	
	/**
	* @method truncate
	* @description Deletes all data in current storage
	*/
	this.truncate = function() {
		mi.storageData[this.idbStorageName] = [];
		this.getTransaction('readwrite').clear();
	}
	
	/**
	* @method insert
	* @description Inserts a new object in current storage, an returns it after insertion
	* @param {Object} o The object to be inserted
	* @return {Object}
	*/
	this.insert = function(o) {
		this.storageData.push(o);
		this.getTransaction('readwrite').add(o);
		return o;
	}
	
	/**
	* @method fetchall
	* @description Returns an array of all objects in the current storage
	* @return {Object[]}
	*/
	this.fetchall = function() {
		return this.storageData;
	}
	
	/**
	* @method match
	* @description Returns an array of objects that match the filter.
	* @param {Object} filter The filter to be used. Its structure is as follows: { key: 'TheFieldSearchedIn', value: 'TheValueSearched' }
	* @return {Object[]} on success, {false} if storage is empty, and {[]} if none of the objects matched the given criteria
	*/
	this.match = function(filter) {
		var ret = [];
		if(this.storageData.length > 0) {
			for(var i = 0; i < this.storageData.length; i++) {
				if(typeof filter.value === 'string') {
					if(this.storageData[i][filter.key].indexOf(filter.value) > -1)
						ret.push(this.storageData[i]);
				} else {
					if(this.storageData[i][filter.key] == filter.value)
						ret.push(this.storageData[i]);
				}
			}
			return ret;
		}
		return false;
	}
	
	/**
	* @method select
	* @description Selects all objects and returns just the key (columns) given
	* @param {String[]} fields List of keys (columns) to be returned
	* @return {Mirror.Storage} Returns a new Mirror.Storage instance with the data retrieved from select
	* NOTE: ALL METHODS IN TEMPORARY STORAGE ARE DISABLED, EXCEPT FOR innerjoin, count, select, match AND fetchall. THIS IS NOT A FULLY FUNCTIONAL STORAGE
	* THIS METHOD PREFIXES EACH KEY (COLUMN) WITH THE STORAGE NAME. SO IF YOU NEST SELECTS KEEP THIS IN MIND.
	*/
	
	this.select = function(fields) {
		var ret = new Mirror.Storage(mi, 'TMPSTORAGE');
		for(var i = 0; i < this.storageData.length; i++) {
			var tmpo = {};
			for(var key in this.storageData[i]) {
				if(this.storageData[i].hasOwnProperty(key) && fields.indexOf(key) > -1)
					tmpo[(this.idbStorageName == 'TMPSTORAGE') ? key : this.idbStorageName + '.' + key] = this.storageData[i][key];
			}
			if(Object.keys(tmpo).length > 0)
				ret.storageData.push(tmpo);
		}
		
		/*
		** Disabled functions
			getTransaction
			truncate
			insert
			get
			getIndex
			delete
			update
		** Enabled Functions
			fetchall
			match
			select
			innerjoin
			count
		*/

		ret.getTransaction = undefined;
		ret.truncate = undefined;
		ret.insert = undefined;
		ret.get = undefined;
		ret.getIndex = undefined;
		ret.delete = undefined;
		ret.update = undefined;
		
		return ret;
	}
	
	/**
	* @method get
	* @description Returns the object according to the key given
	* @param {String|Number} key The key of the object defined in keyPath of object storage config
	* @return {Object} if found, false if not
	*/
	this.get = function(key) {
		var index = this.getIndex(key);
		if(index !== false)
			return this.storageData[index];
		return false;
	}
	
	/**
	* @method getIndex
	* @description Returns the index of the key object selected inside the storageData holder
	* @param {String|Number} key The key of the object defined in keyPath of object storage config
	* @return {Number} The index in the storageData array, {false} if not found
	*/
	this.getIndex = function(key) {
		keyPath = this.getTransaction('readonly').keyPath;
		for(var i = 0; i < this.storageData.length; i++) {
			if(this.storageData[i][keyPath] == key)
				return i;
		}
		return false;
	}
	
	/**
	* @method delete
	* @description Deletes the object that matches the key given
	* @param {String|Number} key The key of the object defined in keyPath of object storage config
	* @return {Object} the deleted object, {false} if not found
	*/
	this.delete = function(key) {
		var index = this.getIndex(key);
		if(index !== false) {
			var tmp = this.get(key);
			this.storageData.splice(index, 1);
			this.getTransaction('readwrite').delete(key);
			return tmp;
		}
		return false;
	}
	
	/**
	* @method update
	* @description Updates the object of the key given with the changes provided
	* @param {String|Number} key The key of the object defined in keyPath of object storage config
	* @param {Object[]} changes Array of objects to be used as changes. Structure of each object: {key: 'TheFieldToUpdate', value: 'TheNewValue'}
	*/
	this.update = function(key, changes) {
		var obj = this.get(key);
		for(var i = 0; i < changes.length; i++)
			obj[changes[i].key] = changes[i].value;
		
		this.storageData[this.getIndex(key)] = obj;
		this.getTransaction('readwrite').put(obj);
	}
	
	/**
	* @method count
	* @description Returns the total of objects contained in this storage
	* @return {Number} The total of objects
	*/
	this.count = function() {
		return this.storageData.length;
	}
	
	/**
	* @method innerjoin
	* @description Returns a new storage object with the result of the inner join
	* @param {String} secondStorage The second storage to be used with inner join
	* @param {Object} filter The criteria to be used. Structure is as follows: { on: 'firstStorageKeyToBeMatched', equals: 'secondStorageKeyToCompareWith'}
	* @return {Mirror.Storage} Temporary storage created to hold the inner join result. Can be used again with innerjoin
	* NOTE: ALL METHODS IN TEMPORARY STORAGE ARE DISABLED, EXCEPT FOR innerjoin, count, select, match AND fetchall. THIS IS NOT A FULLY FUNCTIONAL STORAGE
	* THIS METHOD PREFIXES EACH KEY (COLUMN) WITH THE STORAGE NAME. SO IF YOU NEST INNER JOINS KEEP THIS IN MIND.
	*/
	this.innerjoin = function(secondStorage, filter) {
		var ij = new Mirror.Storage(mi, secondStorage);
		var ret = new Mirror.Storage(mi, 'TMPSTORAGE');
		
		for(var i = 0; i < this.storageData.length; i++) {
			for(var j = 0; j < ij.storageData.length; j++) {
				if(this.storageData[i][filter.on] == ij.storageData[j][filter.equals]) {
					var tmpo = {};
					
					for(var key in this.storageData[i]) {
						if(this.storageData[i].hasOwnProperty(key))
							tmpo[(this.idbStorageName == 'TMPSTORAGE') ? key : this.idbStorageName + '.' + key] = this.storageData[i][key];
					}
					
					for(var key in ij.storageData[j]) {
						if(ij.storageData[j].hasOwnProperty(key))
							tmpo[(ij.idbStorageName == 'TMPSTORAGE') ? key : ij.idbStorageName + '.' + key] = ij.storageData[j][key];
					}
					ret.storageData.push(tmpo);
				}
			}
		}
		
		/*
		** Disabled functions
			getTransaction
			truncate
			insert
			get
			getIndex
			delete
			update
		** Enabled Functions
			fetchall
			match
			select
			innerjoin
			count
		*/

		ret.getTransaction = undefined;
		ret.truncate = undefined;
		ret.insert = undefined;
		ret.get = undefined;
		ret.getIndex = undefined;
		ret.delete = undefined;
		ret.update = undefined;
		
		return ret;
	}
}

/**
* @method with
* @description Creates a new instance of Mirror.Storage
* @param {String} name The storage you want to access
*/
Mirror.prototype.with = function(name) {
	return new Mirror.Storage(this, name);
}