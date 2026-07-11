// Slice
import {
  addItemToEntity,
  clearEntityArray,
  updateItemInEntity,
  replaceEntityArray,
  deleteItemFromEntity,
  addEntityToObjectStore,
  updateEntityFromObjectStore,
  deleteEntityFromObjectStore,
} from "@/shared/store/objectStore.slice";

// React
import { useCallback, useMemo } from "react";

// Redux
import { useSelector, useDispatch } from "react-redux";

const useObjectStore = (defaultCollectionName = "") => {
  const dispatch = useDispatch();

  // Get the entire object store state
  const objectStore = useSelector((state) => state.objectStore);

  // Get a specific collection
  const getCollection = useCallback(
    (collectionName = defaultCollectionName) => {
      return objectStore[collectionName] || {};
    },
    [objectStore, defaultCollectionName]
  );

  // Get a specific entity by ID from a collection
  const getEntity = useCallback(
    (entityId, collectionName = defaultCollectionName) => {
      const collection = objectStore[collectionName];
      return collection?.[entityId] || null;
    },
    [objectStore, defaultCollectionName]
  );

  // Get all entities from a collection as an array
  const getEntitiesAsArray = useCallback(
    (collectionName = defaultCollectionName) => {
      const collection = objectStore[collectionName] || {};
      return Object.values(collection);
    },
    [objectStore, defaultCollectionName]
  );

  // Get all entity IDs from a collection as an array
  const getEntityIds = useCallback(
    (collectionName = defaultCollectionName) => {
      const collection = objectStore[collectionName] || {};
      return Object.keys(collection);
    },
    [objectStore, defaultCollectionName]
  );

  // Check if entity exists in collection
  const hasEntity = useCallback(
    (entityId, collectionName = defaultCollectionName) => {
      const collection = objectStore[collectionName];
      return Boolean(collection?.[entityId]);
    },
    [objectStore, defaultCollectionName]
  );

  // Add entity to collection
  const addEntity = useCallback(
    (entityId, entityData, collectionName = defaultCollectionName) => {
      dispatch(
        addEntityToObjectStore({
          entityId,
          entityData,
          collectionName,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Update entity in collection
  const updateEntity = useCallback(
    (entityId, entityData, collectionName = defaultCollectionName) => {
      dispatch(
        updateEntityFromObjectStore({
          entityId,
          entityData,
          collectionName,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Delete entity from collection
  const deleteEntity = useCallback(
    (entityId, collectionName = defaultCollectionName) => {
      dispatch(
        deleteEntityFromObjectStore({
          entityId,
          collectionName,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Add item to entity array (for id: [{...}] structure)
  const addItemToEntityArray = useCallback(
    (entityId, item, collectionName = defaultCollectionName) => {
      dispatch(addItemToEntity({ collectionName, entityId, item }));
    },
    [dispatch, defaultCollectionName]
  );

  // Update item in entity array
  const updateItemInEntityArray = useCallback(
    (
      entityId,
      itemId,
      itemData,
      idField = "_id",
      collectionName = defaultCollectionName
    ) => {
      dispatch(
        updateItemInEntity({
          itemId,
          idField,
          itemData,
          entityId,
          collectionName,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Delete item from entity array
  const deleteItemFromEntityArray = useCallback(
    (
      entityId,
      itemId,
      idField = "_id",
      collectionName = defaultCollectionName
    ) => {
      dispatch(
        deleteItemFromEntity({
          collectionName,
          entityId,
          itemId,
          idField,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Replace entire entity array
  const replaceEntityArrayData = useCallback(
    (entityId, newArray, collectionName = defaultCollectionName) => {
      dispatch(
        replaceEntityArray({
          collectionName,
          entityId,
          newArray,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Clear entity array
  const clearEntityArrayData = useCallback(
    (entityId, collectionName = defaultCollectionName) => {
      dispatch(
        clearEntityArray({
          collectionName,
          entityId,
        })
      );
    },
    [dispatch, defaultCollectionName]
  );

  // Get collection count
  const getCollectionCount = useCallback(
    (collectionName = defaultCollectionName) => {
      const collection = objectStore[collectionName] || {};
      return Object.keys(collection).length;
    },
    [objectStore, defaultCollectionName]
  );

  // Check if collection is empty
  const isCollectionEmpty = useCallback(
    (collectionName = defaultCollectionName) => {
      return getCollectionCount(collectionName) === 0;
    },
    [getCollectionCount, defaultCollectionName]
  );

  // Memoized collection data for the default collection
  const collection = useMemo(
    () => getCollection(defaultCollectionName),
    [getCollection, defaultCollectionName]
  );

  const entitiesArray = useMemo(
    () => getEntitiesAsArray(defaultCollectionName),
    [getEntitiesAsArray, defaultCollectionName]
  );

  const entityIds = useMemo(
    () => getEntityIds(defaultCollectionName),
    [getEntityIds, defaultCollectionName]
  );

  const count = useMemo(
    () => getCollectionCount(defaultCollectionName),
    [getCollectionCount, defaultCollectionName]
  );

  const isEmpty = useMemo(
    () => isCollectionEmpty(defaultCollectionName),
    [isCollectionEmpty, defaultCollectionName]
  );

  return {
    // State
    count,
    isEmpty,
    entityIds,
    collection,
    objectStore,
    entitiesArray,

    // Actions
    addEntity,
    updateEntity,
    deleteEntity,

    // Array operations (for id: [{...}] structure)
    addItemToEntityArray,
    clearEntityArrayData,
    replaceEntityArrayData,
    updateItemInEntityArray,
    deleteItemFromEntityArray,

    // Getters
    hasEntity,
    getEntity,
    getEntityIds,
    getCollection,
    isCollectionEmpty,
    getCollectionCount,
    getEntitiesAsArray,
  };
};

export default useObjectStore;
