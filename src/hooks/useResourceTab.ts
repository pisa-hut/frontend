import { useCallback, useEffect, useState } from "react";
import { Form, message } from "antd";
import type { FormInstance } from "antd";

interface ResourceTabConfig<T extends { id: number }, TPayload> {
  listFn: () => Promise<T[]>;
  createFn: (payload: TPayload) => Promise<unknown>;
  updateFn: (id: number, payload: TPayload) => Promise<unknown>;
  deleteFn: (id: number) => Promise<unknown>;
  /** How to populate the form when editing — defaults to spreading the
   *  record. Override for entities like AV / Simulator that need to
   *  JSON-stringify a field for the input. */
  getInitialValues?: (record: T) => Record<string, unknown>;
  /** How to convert form values back to the API payload — defaults to
   *  passing them through unchanged. Override to JSON.parse a field. */
  transformPayload?: (values: Record<string, unknown>) => TPayload;
}

interface ResourceTabState<T extends { id: number }> {
  data: T[];
  loading: boolean;
  modalOpen: boolean;
  editing: T | null;
  saving: boolean;
  form: FormInstance;
  load: () => void;
  openCreate: () => void;
  openEdit: (record: T) => void;
  closeModal: () => void;
  handleSave: (values: Record<string, unknown>) => Promise<void>;
  handleDelete: (id: number) => Promise<void>;
}

/** State machine + mutation handlers shared by every Resources tab.
 *
 *  The four tabs (AVs, Simulators, Samplers, Maps) had grown
 *  near-identical copies of: a load-on-mount + reload-on-CRUD effect,
 *  a Form instance + saving flag, openCreate / openEdit / handleSave /
 *  handleDelete with try/catch + message.success/error, and the four
 *  api function bindings. This hook owns all of that; each tab
 *  supplies the api callbacks (and an optional `getInitialValues` /
 *  `transformPayload` adapter for shape mismatches like JSON-encoded
 *  image_path) and renders the table + form JSX itself. */
export function useResourceTab<T extends { id: number }, TPayload = Record<string, unknown>>(
  config: ResourceTabConfig<T, TPayload>,
): ResourceTabState<T> {
  const {
    listFn,
    createFn,
    updateFn,
    deleteFn,
    getInitialValues = (record) => ({ ...record }),
    transformPayload = (values) => values as unknown as TPayload,
  } = config;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    listFn()
      .then(setData)
      .finally(() => setLoading(false));
  }, [listFn]);

  useEffect(load, [load]);

  const openCreate = useCallback(() => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }, [form]);

  const openEdit = useCallback(
    (record: T) => {
      setEditing(record);
      form.setFieldsValue(getInitialValues(record));
      setModalOpen(true);
    },
    [form, getInitialValues],
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditing(null);
  }, []);

  const handleSave = useCallback(
    async (values: Record<string, unknown>) => {
      setSaving(true);
      try {
        const payload = transformPayload(values);
        if (editing) {
          await updateFn(editing.id, payload);
          message.success("Updated");
        } else {
          await createFn(payload);
          message.success("Created");
        }
        setModalOpen(false);
        form.resetFields();
        setEditing(null);
        load();
      } catch (e) {
        message.error(String(e));
      } finally {
        setSaving(false);
      }
    },
    [editing, form, load, createFn, updateFn, transformPayload],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteFn(id);
        message.success("Deleted");
        load();
      } catch (e) {
        message.error(String(e));
      }
    },
    [deleteFn, load],
  );

  return {
    data,
    loading,
    modalOpen,
    editing,
    saving,
    form,
    load,
    openCreate,
    openEdit,
    closeModal,
    handleSave,
    handleDelete,
  };
}
