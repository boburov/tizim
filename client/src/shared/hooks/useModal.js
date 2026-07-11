// Redux Store
import { useDispatch, useSelector } from "react-redux";

// Modal slice actions
import { open, close, updateData, updateLoading } from "@/shared/store/modal.slice";

const useModal = (defaultModal) => {
  const dispatch = useDispatch();

  const modal = useSelector((state) => state.modal[defaultModal]) || {
    data: null,
    isOpen: false,
    isLoading: false,
  };

  const openModal = (name, data = null) => {
    dispatch(open({ modal: name, data }));
  };

  const closeModal = (name, data = null) => {
    dispatch(close({ modal: name, data }));
  };

  const updateModalLoading = (name, value) => {
    dispatch(updateLoading({ modal: name, value }));
  };

  const updateModalData = (name, data) => {
    dispatch(updateData({ modal: name, data }));
  };

  return {
    ...modal,
    dispatch,
    openModal,
    closeModal,
    updateModalData,
    updateModalLoading,
  };
};

export default useModal;
