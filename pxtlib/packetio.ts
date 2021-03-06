namespace pxt.packetio {
    export interface TalkArgs {
        cmd: number;
        data?: Uint8Array;
    }

    export interface PacketIOWrapper {
        readonly io: PacketIO;

        familyID: number;

        onSerial: (buf: Uint8Array, isStderr: boolean) => void;

        reconnectAsync(): Promise<void>;
        disconnectAsync(): Promise<void>;
        reflashAsync(resp: pxtc.CompileResult): Promise<void>;
    }

    export interface PacketIO {
        sendPacketAsync(pkt: Uint8Array): Promise<void>;
        onDeviceConnectionChanged: (connect: boolean) => void;
        onConnectionChanged: () => void;
        onData: (v: Uint8Array) => void;
        onError: (e: Error) => void;
        onEvent: (v: Uint8Array) => void;
        error(msg: string): any;
        reconnectAsync(): Promise<void>;
        disconnectAsync(): Promise<void>;
        isConnected(): boolean;
        isSwitchingToBootloader?: () => void;
        // release any native resource before being released
        disposeAsync(): Promise<void>;

        // these are implemneted by HID-bridge
        talksAsync?(cmds: TalkArgs[]): Promise<Uint8Array[]>;
        sendSerialAsync?(buf: Uint8Array, useStdErr: boolean): Promise<void>;

        onSerial?: (v: Uint8Array, isErr: boolean) => void;
    }

    export let mkPacketIOAsync: () => Promise<PacketIO>;
    export let mkPacketIOWrapper: (io: PacketIO) => PacketIOWrapper;

    let wrapper: PacketIOWrapper;
    let initPromise: Promise<PacketIOWrapper>;
    let onConnectionChangedHandler: () => void = () => { };
    let onSerialHandler: (buf: Uint8Array, isStderr: boolean) => void;

    export function isConnected() {
        return wrapper && wrapper.io.isConnected();
    }

    export function disconnectAsync(): Promise<void> {
        log('disconnect')
        let p = Promise.resolve();
        if (wrapper) {
            p = p.then(() => wrapper.disconnectAsync())
                .then(() => wrapper.io.disposeAsync())
                .catch(e => {
                    // swallow execeptions
                    pxt.reportException(e);
                })
                .finally(() => {
                    initPromise = undefined; // dubious
                    wrapper = undefined;
                });
        }
        if (onConnectionChangedHandler)
            p = p.then(() => onConnectionChangedHandler());
        return p;
    }

    export function configureEvents(
        onConnectionChanged: () => void,
        onSerial: (buf: Uint8Array, isStderr: boolean) => void
    ): void {
        onConnectionChangedHandler = onConnectionChanged;
        onSerialHandler = onSerial;
        if (wrapper) {
            wrapper.io.onConnectionChanged = onConnectionChangedHandler;
            wrapper.onSerial = onSerialHandler;
        }
    }

    function wrapperAsync(): Promise<PacketIOWrapper> {
        if (wrapper)
            return Promise.resolve(wrapper);

        pxt.log(`packetio: new wrapper`)
        return mkPacketIOAsync()
            .then(io => {
                io.onConnectionChanged = onConnectionChangedHandler;
                wrapper = mkPacketIOWrapper(io);
                if (onSerialHandler)
                    wrapper.onSerial = onSerialHandler;
                return wrapper;
            })
    }

    export function initAsync(force = false): Promise<PacketIOWrapper> {
        pxt.log(`packetio: init ${force ? "(force)" : ""}`)
        if (!initPromise) {
            let p = Promise.resolve();
            if (force)
                p = p.then(() => disconnectAsync());
            initPromise = p.then(() => wrapperAsync())
                .finally(() => { initPromise = undefined })
        }
        return initPromise;
    }
}