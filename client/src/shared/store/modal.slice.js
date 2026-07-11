// Redux Store
import { createSlice } from "@reduxjs/toolkit";

const createInitialModalData = () => ({
  isOpen: false,
  data: {},
  isLoading: false,
});

const initialState = {};

export const modalSlice = createSlice({
  initialState,
  name: "modal",
  reducers: {
    open: (state, action) => {
      const { modal, data } = action.payload;
      if (!state[modal]) state[modal] = createInitialModalData();

      state[modal].isOpen = true;
      state[modal].data = { ...(data || {}) };
    },

    close: (state, action) => {
      const { modal, data } = action.payload;
      if (!state[modal]) state[modal] = createInitialModalData();

      state[modal].isOpen = false;
      state[modal].isLoading = false;
      state[modal].data = { ...(data || {}) };
    },

    updateData: (state, action) => {
      const { modal, data } = action.payload;
      if (!state[modal]) state[modal] = createInitialModalData();

      state[modal].data = { ...state[modal].data, ...(data || {}) };
    },

    updateLoading: (state, action) => {
      const { modal, value } = action.payload;
      if (!state[modal]) state[modal] = createInitialModalData();

      state[modal].isLoading = value;
    },
  },
});

export const { open, close, updateLoading, updateData } = modalSlice.actions;

export default modalSlice.reducer;
