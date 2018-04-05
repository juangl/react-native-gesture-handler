import { NativeModules } from 'react-native';
import NativeAnimatedHelper from '../NativeAnimatedHelper';

const { ReanimatedModule } = NativeModules;

const UPDATED_NODES = [];

let loopID = 1;
let propUpdatesEnqueued = null;

function sanitizeConfig(config) {
  for (const key in config) {
    const value = config[key];
    if (value instanceof AnimatedNode) {
      config[key] = value.__nodeID;
    }
  }
  return config;
}

function runPropUpdates() {
  const visitedNodes = new Set();
  const findAndUpdateNodes = node => {
    if (visitedNodes.has(node)) {
      return;
    } else {
      visitedNodes.add(node);
    }
    if (typeof node.update === 'function') {
      node.update();
    } else {
      node.__getChildren().forEach(findAndUpdateNodes);
    }
  };
  for (let i = 0; i < UPDATED_NODES.length; i++) {
    const node = UPDATED_NODES[i];
    findAndUpdateNodes(node);
  }
  UPDATED_NODES.length = 0; // clear array
  propUpdatesEnqueued = null;
  loopID += 1;
}

let nodeCount = 0;

export default class AnimatedNode {
  constructor(nodeConfig, inputNodes) {
    this.__nodeID = ++nodeCount;
    this.__nodeConfig = sanitizeConfig(nodeConfig);
    this.__inputNodes =
      inputNodes && inputNodes.filter(node => node instanceof AnimatedNode);
  }

  __attach() {
    this.__nativeInitialize();
    this.__inputNodes &&
      this.__inputNodes.forEach(node => node.__addChild(this));
    this.__attached = true;
  }

  __detach() {
    this.__inputNodes &&
      this.__inputNodes.forEach(node => node.__removeChild(this));
    this.__attached = false;
    this.__nativeTearDown();
  }

  __lastLoopID = 0;
  __memoizedValue = null;

  __children = [];

  __getValue() {
    if (this.__lastLoopID < loopID) {
      this.__lastLoopID = loopID;
      return (this.__memoizedValue = this.__onEvaluate());
    }
    return this.__memoizedValue;
  }

  __forceUpdateCache(newValue) {
    this.__memoizedValue = newValue;
    this.__markUpdated();
  }

  __dangerouslyRescheduleEvaluate() {
    this.__lastLoopID = 0;
    this.__markUpdated();
  }

  __markUpdated() {
    UPDATED_NODES.push(this);
    if (!propUpdatesEnqueued) {
      propUpdatesEnqueued = setImmediate(runPropUpdates);
    }
  }

  __nativeInitialize() {
    if (this.__nodeConfig) {
      ReanimatedModule.createNode(this.__nodeID, this.__nodeConfig);
      this.__nodeConfig = undefined;
    }
  }

  __nativeTearDown() {
    if (!this.__nodeConfig) {
      ReanimatedModule.dropNode(this.__nodeID);
    }
  }

  __onEvaluate() {
    throw new Excaption('Missing implementation of onEvaluate');
  }

  __getProps() {
    return this.__getValue();
  }

  __getChildren() {
    return this.__children;
  }

  __addChild(child) {
    if (this.__children.length === 0) {
      this.__attach();
    }
    this.__children.push(child);
    child.__nativeInitialize();
    // CONNECT!

    // if (this.__isNative) {
    //   // Only accept "native" animated nodes as children
    //   child.__makeNative();
    //   NativeAnimatedHelper.API.connectAnimatedNodes(
    //     this.__getNativeTag(),
    //     child.__getNativeTag()
    //   );
    // }
  }

  __removeChild(child) {
    const index = this.__children.indexOf(child);
    if (index === -1) {
      console.warn("Trying to remove a child that doesn't exist");
      return;
    }
    if (this.__isNative && child.__isNative) {
      NativeAnimatedHelper.API.disconnectAnimatedNodes(
        this.__getNativeTag(),
        child.__getNativeTag()
      );
    }
    this.__children.splice(index, 1);
    if (this.__children.length === 0) {
      this.__detach();
    }
  }
}