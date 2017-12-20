##api ref list


###`GET /`   
General info in json format


###`POST /list/ships`  
Params:  
- **data** string with data. 7.5k symbols limit.

###`GET /list/ships/:id`
Retrieves data.
On success will return object with like this `{data:"asdasd....1231asdas", subtype:"shiplist"}`