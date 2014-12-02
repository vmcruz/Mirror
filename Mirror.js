var Mirror = function(idbName) {
	this.idbName = idbName;
	this.idbConnection = null;
	this.storageData = [];
	this.storageConfig = [];
}

Mirror.prototype.createStorage = function(name, opts) {
	this.storageConfig[name] = opts;
}

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

Mirror.prototype.close = function() {
	this.idbConnection.close();
}

Mirror.prototype.drop = function() {
	window.indexedDB.deleteDatabase(this.idbName);
}

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
						oncomplete();
				}
			}
		})(this, storages[i]);
	}
}

Mirror.prototype.with = function(name) {
	return new (
		function(mi, name) {
			this.idbStorageName = name;
			this.storageData = mi.storageData[this.idbStorageName] || [];
			
			this.getTransaction = function(mode) {
				return mi.idbConnection.transaction([this.idbStorageName], mode).objectStore(this.idbStorageName);
			}
			
			this.truncate = function() {
				this.getTransaction('readwrite').clear();
			}
			
			this.insert = function(o) {
				this.storageData.push(o);
				this.getTransaction('readwrite').add(o);
				return o;
			}
			
			this.fetchall = function() {
				return this.storageData;
			}
			
			this.match = function(filter) {
				var ret = [];
				if(this.storageData.length > 0) {
					for(var i = 0; i < this.storageData.length; i++) {
						if(this.storageData[i][filter.key] == filter.value)
							ret.push(this.storageData[i]);
					}
					return ret;
				}
				return false;
			}
			
			this.get = function(key) {
				var index = this.getIndex(key);
				if(index !== false)
					return this.storageData[index];
				return false;
			}
			
			this.getIndex = function(key) {
				keyPath = this.getTransaction('readonly').keyPath;
				for(var i = 0; i < this.storageData.length; i++) {
					if(this.storageData[i][keyPath] == key)
						return i;
				}
				return false;
			}
			
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
			
			this.update = function(key, changes) {
				var obj = this.get(key);
				for(var i = 0; i < changes.length; i++)
					obj[changes[i].key] = changes[i].value;
				
				this.storageData[this.getIndex(key)] = obj;
				this.getTransaction('readwrite').put(obj);
			}
			
			this.count = function() {
				return this.storageData.length;
			}
		}
	)(this, name);
}