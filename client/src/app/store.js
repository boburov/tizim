// Redux Store
import { configureStore } from "@reduxjs/toolkit";

// Slices
import modalReducer from "@/shared/store/modal.slice";

export default configureStore({
  reducer: { modal: modalReducer },
});
