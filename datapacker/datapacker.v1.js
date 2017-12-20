/**
 * This packer version takes Array in the following format
 * [
 *  ship_id, ship_master_id, ship_lvl, sally,
 *  ship_tp_left, ship_ar_left, ship_fp_left, ship_aa_left, ship_lk_left,
 *  ship_hp_mod, ship_as_mod
 * ]
 * usually tp is more common them ar -> fp -> aa -> lk
 * This is used in order as left points.
 * Top modded ship will get 00000 which would be omit in output.
 * in result for [1, 237, 63, 0, 0, 0, 0, 0, 47, 0, 0]
 * we will get "01300$L00" instead of "13000000$0L00"
 *
 * it's important to note that last 2 params is mod val, which is 0 for stock ship
 */
class datapacker_v1 {
    constructor() {
        /**
         * will be placed in front of ship list and checked on unpackShips
         * @type {string}
         */
        this.version = "1";

        /**
         * allowed symbols into hash
         * "," and ";" aren't included, since they used as separators
         * @type {string}
         */
        this.alphabet = "0123456789" +
            "abcdefghijklmnopqrstuvwxyz" +
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
            "!$&'()*+=-._~:@/?";

    }

    /**
     * encodes int to base79
     * @param input
     * @returns {string}
     */
    _to79(input) {
        const alphabetLength = this.alphabet.length;
        let hash = "";
        do {
            hash = this.alphabet[input % alphabetLength] + hash;
            input = parseInt(input / alphabetLength, 10);
        } while (input);

        return hash;
    };

    /**
     * decodes int from base79
     * @param input
     * @returns {*}
     */
    _from79(input) {
        return input.split("").map(
            (item) => this.alphabet.indexOf(item)
        ).reduce(
            (carry, item) => carry * this.alphabet.length + item,
            0
        );
    };

    /**
     *
     * @param shipData {Array} [1, 237, 63, 0, 0, 0, 0, 0, 47, 0, 0]
     * @returns {string} packed string like "0E2!0ygpL00" or "1j$1K03MrhEI00"
     */
    _packShip(shipData) {
        let str, s;
        /**
         * sally * 5 + packed id length
         */
        const packedId = this._to79(shipData[0]);

        str = this._to79(shipData[3] * 5 + packedId.length - 1);

        str += packedId;

        /**
         * masterId can be big or small. 2 chars
         */
        s = this._to79(shipData[1]);
        if (s.length === 1) s = `0${s}`;
        str += s;

        /**
         * level can go greater then 79. 2 chars
         */
        s = this._to79(shipData[2]);
        if (s.length === 1) s = `0${s}`;
        str += s;

        /**
         * if first symbols is 0 we can drop them i.e. 000001 -> 1
         * later while unpacking we can just add missing 0 to the beginning
         */
        let canSkip = true;
        for (let i = 4; i < 9; i++) {
            if (!canSkip || shipData[i] !== 0) {
                canSkip = false;
                str += this._to79(shipData[i]);
            }
        }

        for (let i = 9; i < shipData.length; i++) {
            str += this._to79(shipData[i]);
        }
        return str;
    };

    /**
     *
     * @param str {string} like "0E2!0ygpL00" or "1j$1K03MrhEI00"
     * @returns {Array} like this [1, 237, 63, 0, 0, 0, 0, 0, 47, 0, 0]
     */
    _unpackShip(str) {
        let shipData = [];
        let arr = str.split(""), s = "";

        const combined = this._from79(arr.shift());
        const sally = Math.floor(combined / 5);
        const id_len = combined % 5 + 1;

        for (let i = 0; i < id_len; i++)
            s += arr.shift();

        shipData.push(parseInt(this._from79(s), 10));

        /**
         * masterId
         */
        s = arr.shift();
        s += arr.shift();
        shipData.push(parseInt(this._from79(s), 10));

        /**
         * level
         */
        s = arr.shift();
        s += arr.shift();
        shipData.push(parseInt(this._from79(s), 10));

        /**
         * sally
         */
        shipData.push(sally);

        /**
         * what remains is
         * ["tp", "ar", "fp", "aa", "lk", "hp", "as"]
         * but since capped is dropped we need to read them.
         */
        arr.splice(0, 0, ...new Array(7 - arr.length).fill("0"));

        arr.join("").match(/./g).map((d) => shipData.push(this._from79(d)));

        return shipData;
    };

    /**
     *
     * @param shipsArray
     * @returns {string}
     */
    packShips(shipsArray) {
        let s = `${this.version};;`;
        s += shipsArray.map((s) => this._packShip(s)).join(`,`);
        return s;
    }

    /**
     *
     * @param shipsString
     */
    unpackShips(shipsString) {
        const arr = shipsString.split(`;;`);
        const v = arr.shift();
        if (v !== this.version)
            throw new Error(`Baka! This was packed with different version! ${v}. This object can parse only ${this.version}`);

        return arr[0].split(",").map((s) => this._unpackShip(s));
    }

    _test(shipsArray) {
        return JSON.stringify(shipsArray) === JSON.stringify(this.unpackShips(this.packShips(shipsArray)));
    }

    _validate(testString) {
        const regExp = new RegExp("[" + this.alphabet.replace("-", "\\-") + ";,]+");
        if (testString.replace(regExp, '').length > 0)
            throw new Error(`invalid characters -> ${testString.replace(regExp, '')}`);

        if (testString.length === 0 || testString.length > 7500) {//5k symbols should cover 400 ships
            throw new Error(`invalid size -> ${testString.length}`)
        }

        const arr = testString.split(`;;`);
        if(arr.length<=1 || arr.length>3){
            throw new Error(`No version or data. ;; split length -> ${arr.length}`);
        }

        const v = arr.shift();
        if (v !== this.version)
            throw new Error(`incorrect packer version ${v}, should be ${this.version}`);

        arr[0].split(",").map((s) =>{
            if(s.length===0 || s.length>17){
                throw new Error(`ship length problem -> ${s.length}, '${s.substr(0,20)}'`)
            }
        });

        return true;
    }

}

const dp1 = new datapacker_v1();
module.exports = dp1;