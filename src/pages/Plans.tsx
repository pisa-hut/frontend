import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AutoComplete,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Table,
  message,
} from "antd";
import type { InputRef } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { getColumnSearchProps } from "../components/ColumnSearch";
import PageHeader from "../components/PageHeader";
import ChipRow from "../components/ChipRow";
import { useSessionStorageState } from "../hooks/useSessionStorageState";

// Lazy: only opened when the user clicks the "Manage tags" button.
const TagManagerModal = lazy(() => import("../components/TagManagerModal"));
import { api } from "../api/client";
import type { PlanResponse, MapResponse, ScenarioResponse } from "../api/types";

/** Per-row chips + inline AutoComplete for adding a new tag. AutoComplete
 *  pulls suggestions from the parent's de-duped list of tags across all
 *  plans so common labels stay one keystroke away. Mutations go through
 *  PostgREST PATCH and the parent's `onChange` re-fetches. */
function TagsCell({
  plan,
  suggestions,
  onChange,
}: {
  plan: PlanResponse;
  suggestions: string[];
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const commit = async () => {
    const value = draft.trim();
    if (!value) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (plan.tags.includes(value)) {
      setAdding(false);
      setDraft("");
      return;
    }
    try {
      await api.updatePlan(plan.id, { tags: [...plan.tags, value] });
      onChange();
    } catch (e) {
      message.error(String(e));
    } finally {
      setAdding(false);
      setDraft("");
    }
  };

  const remove = async (tag: string) => {
    try {
      await api.updatePlan(plan.id, { tags: plan.tags.filter((t) => t !== tag) });
      onChange();
    } catch (e) {
      message.error(String(e));
    }
  };

  return (
    <Space size={[4, 4]} wrap>
      {plan.tags.map((tag) => (
        <Tag key={tag} closable onClose={() => remove(tag)}>
          {tag}
        </Tag>
      ))}
      {adding ? (
        <AutoComplete
          ref={inputRef as never}
          size="small"
          style={{ width: 120 }}
          value={draft}
          onChange={(v) => setDraft(v)}
          onBlur={commit}
          options={suggestions.filter((s) => !plan.tags.includes(s)).map((s) => ({ value: s }))}
        >
          <Input size="small" onPressEnter={commit} />
        </AutoComplete>
      ) : (
        <Tag
          style={{ cursor: "pointer", borderStyle: "dashed", background: "transparent" }}
          onClick={() => setAdding(true)}
        >
          <PlusOutlined /> tag
        </Tag>
      )}
    </Space>
  );
}

export default function Plans() {
  const [data, setData] = useState<PlanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlanResponse | null>(null);
  const [maps, setMaps] = useState<MapResponse[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioResponse[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Suggestions for the inline tag editor — refreshed alongside the
  // plan list so newly-added tags become suggestions for sibling rows.
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  // Filter state mirrors the Tasks-page conventions: sessionStorage so
  // it survives in-tab refreshes but resets across sessions; tags
  // default to all-selected on first visit (an explicit clear sticks
  // via the *_initialised flag).
  const [tagFilter, setTagFilter] = useSessionStorageState<string[]>("plans.tagFilter", []);
  const [tagFilterInitialised, setTagFilterInitialised] = useSessionStorageState<boolean>(
    "plans.tagFilterInitialised",
    false,
  );
  const [nameSearch, setNameSearch] = useSessionStorageState<string>("plans.nameSearch", "");

  const load = () => {
    setLoading(true);
    Promise.all([api.listPlans(), api.listPlanTags()])
      .then(([plans, tags]) => {
        setData(plans);
        setTagSuggestions(tags);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const fetchDeps = () =>
    Promise.all([api.listMaps(), api.listScenarios()]).then(([m, s]) => {
      setMaps(m);
      setScenarios(s);
    });
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    fetchDeps().then(() => setModalOpen(true));
  };
  const openEdit = (r: PlanResponse) => {
    setEditing(r);
    form.setFieldsValue(r);
    fetchDeps().then(() => setModalOpen(true));
  };

  const handleSave = async (values: { name: string; map_id: number; scenario_id: number }) => {
    setSaving(true);
    try {
      if (editing) {
        await api.updatePlan(editing.id, values);
        message.success("Updated");
      } else {
        await api.createPlan(values);
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
  };

  // Auto-fill the tag filter with every available tag on first visit,
  // so untagged plans stay out of the way until the operator
  // explicitly broadens the scope. Same pattern as Tasks/Dashboard.
  useEffect(() => {
    if (tagFilterInitialised) return;
    if (tagSuggestions.length === 0) return;
    setTagFilter(tagSuggestions);
    setTagFilterInitialised(true);
  }, [tagFilterInitialised, tagSuggestions, setTagFilter, setTagFilterInitialised]);

  // Per-tag count: total plans (unscoped by name search) carrying that
  // tag. Mirrors Tasks' counting strategy so picking tag A doesn't
  // blank out tag B's count.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data) for (const t of p.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  }, [data]);

  const tagOptions = useMemo(
    () => tagSuggestions.map((t) => ({ label: t, value: t })),
    [tagSuggestions],
  );

  const toggleTag = useCallback(
    (v: string) => {
      setTagFilter(tagFilter.includes(v) ? tagFilter.filter((x) => x !== v) : [...tagFilter, v]);
      setTagFilterInitialised(true);
    },
    [setTagFilter, setTagFilterInitialised, tagFilter],
  );
  const clearTagFilter = useCallback(() => {
    setTagFilter([]);
    setTagFilterInitialised(true);
  }, [setTagFilter, setTagFilterInitialised]);

  const filteredData = useMemo(() => {
    const needle = nameSearch.trim().toLowerCase();
    const tagSet = tagFilter.length ? new Set(tagFilter) : null;
    return data.filter((p) => {
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      if (tagSet) {
        const tags = p.tags ?? [];
        if (tags.length === 0) return false;
        if (!tags.some((t) => tagSet.has(t))) return false;
      }
      return true;
    });
  }, [data, nameSearch, tagFilter]);

  const handleDelete = async (id: number) => {
    try {
      await api.deletePlan(id);
      message.success("Deleted");
      load();
    } catch (e) {
      message.error(String(e));
    }
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 60,
      ...getColumnSearchProps<PlanResponse>("id"),
    },
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      ...getColumnSearchProps<PlanResponse>("name"),
    },
    {
      title: "Map",
      dataIndex: "map_id",
      key: "map_id",
      width: 80,
      ...getColumnSearchProps<PlanResponse>("map_id"),
    },
    {
      title: "Scenario",
      dataIndex: "scenario_id",
      key: "scenario_id",
      width: 80,
      ...getColumnSearchProps<PlanResponse>("scenario_id"),
    },
    {
      title: "Tags",
      key: "tags",
      width: 360,
      render: (_: unknown, r: PlanResponse) => (
        <TagsCell plan={r} suggestions={tagSuggestions} onChange={load} />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_: unknown, r: PlanResponse) => (
        <Dropdown
          menu={{
            items: [
              { key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => openEdit(r) },
              { type: "divider" as const },
              {
                key: "delete",
                icon: <DeleteOutlined />,
                label: "Delete",
                danger: true,
                onClick: () => handleDelete(r.id),
              },
            ],
          }}
          trigger={["click"]}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="A plan pairs a map with a scenario. Tag plans to group them on the dashboard and filter on Tasks."
      >
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Create
        </Button>
        <Button icon={<TagsOutlined />} onClick={() => setTagManagerOpen(true)}>
          Manage tags
        </Button>
        <Button icon={<ReloadOutlined />} onClick={load}>
          Refresh
        </Button>
      </PageHeader>

      <Suspense fallback={null}>
        <TagManagerModal
          open={tagManagerOpen}
          onClose={() => setTagManagerOpen(false)}
          onChanged={load}
        />
      </Suspense>
      <Space direction="vertical" size={8} style={{ width: "100%", marginBottom: 12 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by name"
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <ChipRow
          label="Tags"
          options={tagOptions}
          counts={tagCounts}
          selected={tagFilter}
          onToggle={toggleTag}
          onClear={clearTagFilter}
        />
      </Space>
      <Table
        dataSource={filteredData}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: "max-content" }}
        pagination={{ pageSize: 20, showTotal: (t) => `${t} plans` }}
      />
      <Modal
        title={editing ? "Edit Plan" : "Create Plan"}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="map_id" label="Map" rules={[{ required: true }]}>
            <Select
              options={maps.map((m) => ({ label: `${m.name} (#${m.id})`, value: m.id }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="scenario_id" label="Scenario" rules={[{ required: true }]}>
            <Select
              options={scenarios.map((s) => ({
                label: `${s.title ?? s.scenario_path} (#${s.id})`,
                value: s.id,
              }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} block>
              {editing ? "Save" : "Create"}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
