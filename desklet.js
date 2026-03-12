const Desklet = imports.ui.desklet;
const Settings = imports.ui.settings;
const St = imports.gi.St;
const GLib = imports.gi.GLib;
const Soup = imports.gi.Soup;
const Mainloop = imports.mainloop;
const Pango = imports.gi.Pango;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Cogl = imports.gi.Cogl;

function MyDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}
MyDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,
    _init: function(metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);
        let imagePath = this.metadata.path + "/path16.png";
        let pixbuf = GdkPixbuf.Pixbuf.new_from_file(imagePath);
        const containerWidth = 360;
        const imageWidth = 70;
        const horizontalPadding = 24;
        const gap = 10;

        const textWidth = containerWidth - imageWidth - horizontalPadding - gap;

        this.settings = new Settings.DeskletSettings(this, metadata.uuid, desklet_id);
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "refreshInterval",
            "refreshInterval",
            this._onSettingsChanged,
            null
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "jokeCategory",
            "jokeCategory",
            this._onSettingsChanged,
            null
        );
        this.settings.bindProperty(
            Settings.BindingDirection.IN,
            "apiChoice",
            "apiChoice",
            this._onSettingsChanged,
            null
        );

        this.container = new St.BoxLayout({
            vertical: false,
            // x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            style: `
                width: ${containerWidth}px;
                height: 100px;
                padding: 12px;
                border-radius: 10px;
                background-color: rgba(0,0,0,0.5);
                border: 1px solid #FAFAFA;
            `
        });

        this.imageBox = new St.BoxLayout({
            vertical: true,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style: `
                width: ${imageWidth}px;
                padding-right: ${gap}px;
            `
        });

        this.box = new St.BoxLayout({
            vertical: true,
            // x_expand: false,
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            style: `width: ${textWidth}px;`
        });

        let image = new Clutter.Image();
        image.set_data(
            pixbuf.get_pixels(),
            pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
            pixbuf.get_width(),
            pixbuf.get_height(),
            pixbuf.get_rowstride()
        );

        this.info = new Clutter.Actor({
            width: 60,
            height: 60,
            content: image
        });

        this.setupLabel = new St.Label({ style: `width: ${textWidth}px;` });
        this.punchlineLabel = new St.Label({ style: `width: ${textWidth}px; padding-top: 15px; padding-bottom: 10px;` });

        this.setupLabel.clutter_text.set_line_wrap(true);
        this.setupLabel.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.setupLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.punchlineLabel.clutter_text.set_line_wrap(true);
        this.punchlineLabel.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
        this.punchlineLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);

        this.imageBox.add_child(this.info);
        this.box.add_child(this.setupLabel);
        this.box.add_child(this.punchlineLabel);
        this.container.add_child(this.imageBox);
        this.container.add_child(this.box);

        this.setContent(this.container);

        this._session = new Soup.Session();
        this._onSettingsChanged();

        this.metadata["prevent-decorations"] = false;
        this.setHeader("Joke Desklet");

        this._session = new Soup.Session();
        this._loadJoke();
        this._timeout = Mainloop.timeout_add_seconds(this.refreshInterval, () => {
            this._loadJoke();
            return true;
        });
    },
    _onSettingsChanged: function() {
        // remove previous timer
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }

        // create new timer
        this._timeout = Mainloop.timeout_add_seconds(this.refreshInterval, () => {
            this._loadJoke();
            return true;
        });
        this._loadJoke();
    },
    on_desklet_removed: function() {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
    },

    layoutFix : function(){
        this.setupLabel.clutter_text.queue_relayout();
        this.punchlineLabel.clutter_text.queue_relayout();
        this.box.queue_relayout();
        this.container.queue_relayout();
        this.actor.queue_relayout();
    },

    getFromIcanhazAPI:function() {
        const url = "https://icanhazdadjoke.com/";
        const message = Soup.Message.new("GET", url);

        message.request_headers.append("Accept", "application/json");
        message.request_headers.append(
            "User-Agent",
            "MyDesklet/1.0 (https://example.com)"
        );

        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    if (message.get_status() !== Soup.Status.OK) {
                        throw new Error(`HTTP error: ${message.get_status()}`);
                    }

                    const bytes = session.send_and_read_finish(result);
                    const decoder = new TextDecoder("utf-8");
                    const response = decoder.decode(bytes.get_data());
                    const data = JSON.parse(response);

                    this.setupLabel.set_text(data.joke || "No joke received.");

                    if (this.punchlineLabel) {
                        this.punchlineLabel.set_text("");
                    }
                    this.layoutFix();
                } catch (e) {
                    global.logError(e);
                    this.setupLabel.set_text("Failed to load joke.");
                    if (this.punchlineLabel) {
                        this.punchlineLabel.set_text("");
                    }
                }
            }
        );
    },
    getFromJokeAPI:function(){
        let url = `https://v2.jokeapi.dev/joke/${this.jokeCategory}?safe-mode`;
        let message = Soup.Message.new("GET", url);
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder("utf-8");
                    let response = decoder.decode(bytes.get_data());
                    let data = JSON.parse(response);
                    if (data.type === "single") {
                        this.setupLabel.set_text(data.joke);
                        this.punchlineLabel.set_text(``);
                    } else {
                        this.setupLabel.set_text(`${data.setup}`);
                        this.punchlineLabel.set_text(`${data.delivery}`);
                    }
                    this.layoutFix();
                } catch (e) {
                    global.logError(e);
                    this._loadJoke();
                    // this.label.set_text("Failed to load joke.");
                }
            }
        );
    },
    getFromOfficialJoke:function(){
        let url = `https://official-joke-api.appspot.com/random_joke`;
        let message = Soup.Message.new("GET", url);
        this._session.send_and_read_async(
            message,
            GLib.PRIORITY_DEFAULT,
            null,
            (session, result) => {
                try {
                    let bytes = session.send_and_read_finish(result);
                    let decoder = new TextDecoder("utf-8");
                    let response = decoder.decode(bytes.get_data());
                    let data = JSON.parse(response);
                    if (data.type === "general") {
                        this.setupLabel.set_text(`${data.setup}`);
                        this.punchlineLabel.set_text(`${data.punchline}`);
                    } else {
                        this.setupLabel.set_text(`${data.setup}`);
                        this.punchlineLabel.set_text(`${data.punchline}`);
                    }
                    this.layoutFix();
                } catch (e) {
                    global.logError(e);
                    this._loadJoke();
                    // this.label.set_text("Failed to load joke.");
                }
            }
        );
    },
    _loadJoke: function() {
        switch(this.apiChoice){
            case "jokeapi":
                this.getFromJokeAPI();
                break;
            case "officialjoke":
                this.getFromOfficialJoke();
                break;
            case "icanhazdadjoke":
                this.getFromIcanhazAPI();
                break;
            default:
                this.getFromOfficialJoke();
                break;
        }
    }
};
function main(metadata, desklet_id) {
    return new MyDesklet(metadata, desklet_id);
}