// src/components/WorkTypesManager/WorkTypesManager.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import toast from "react-hot-toast";
import styles from "./WorkTypesManager.module.css";
import {
  FaPlus,
  FaTrash,
  FaSave,
  FaInfoCircle,
  FaCopy,
  FaRegCommentDots,
} from "react-icons/fa";
import { useAdminLists } from "../../hooks/useAdminLists";
import {
  addWorkTypeAndInvoice,
  updateWorkTypeAndInvoice,
  deleteWorkTypeAndInvoice,
} from "../../services/workTypeService";

const SearchableSelect = ({ options, value, onChange, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      const selectedOption = options.find((opt) => opt.id === value);
      setSearchTerm(selectedOption ? selectedOption.name : "");
    }
  }, [value, options, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        const selectedOption = options.find((opt) => opt.id === value);
        setSearchTerm(selectedOption ? selectedOption.name : "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [options, value]);

  const filteredOptions = options.filter((opt) =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div
      ref={wrapperRef}
      className={styles.searchableSelectWrapper}
      style={{ zIndex: isOpen ? 99999 : 1 }}
    >
      <input
        type="text"
        className={styles.searchableInput}
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={(e) => {
          setIsOpen(true);
          e.target.select();
        }}
      />
      {isOpen && (
        <ul className={styles.searchableDropdown}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <li
                key={opt.id}
                className={styles.searchableOption}
                onClick={() => {
                  onChange(opt.id);
                  setSearchTerm(opt.name);
                  setIsOpen(false);
                }}
              >
                {opt.name}
              </li>
            ))
          ) : (
            <li className={styles.searchableNoOptions}>Нічого не знайдено</li>
          )}
        </ul>
      )}
    </div>
  );
};

const WorkTypesManager = ({ addressId, addressData }) => {
  const [workTypes, setWorkTypes] = useState([]);
  useEffect(() => {
    window.dispatchEvent(new Event("assignments:refresh"));
  }, [workTypes]);
  const [people, setPeople] = useState([]);
  const { workTypeTemplates, loading: listsLoading } = useAdminLists();
  const [loading, setLoading] = useState(true);

  const [visibleNoteIds, setVisibleNoteIds] = useState({});

  const [newWorkType, setNewWorkType] = useState({
    work_type_template_id: "",
    person_id: "",
    payment_amount: "",
    date: "",
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [workTypesRes, peopleRes] = await Promise.all([
          supabase
            .from("work_types")
            .select("*, people(name), work_type_templates(name)")
            .eq("address_id", addressId)
            .order("created_at"),
          supabase.from("people").select("id, name, status").order("name"),
        ]);

        if (workTypesRes.error) throw workTypesRes.error;
        if (peopleRes.error) throw peopleRes.error;

        setWorkTypes(workTypesRes.data);
        setPeople(peopleRes.data);
      } catch (error) {
        toast.error("Failed to load work types.");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [addressId]);

  const sendNotification = async (personId) => {
    if (!personId || !addressData?.address || !addressData?.date) {
      return;
    }

    try {
      const { error } = await supabase.functions.invoke(
        "send-whatsapp-notification",
        {
          body: {
            personId: personId,
            address: addressData.address,
            date: addressData.date,
          },
        },
      );

      if (error) {
        let errorDetails = error;
        try {
          if (error.context && typeof error.context.json === "function") {
            const errorJson = await error.context.json();
            errorDetails = errorJson.error || errorJson;
          }
        } catch (e) {
          /* ignore */
        }
        console.error("SERVER ERROR DETAILS:", errorDetails);
        toast.error(
          `Помилка: ${typeof errorDetails === "string" ? errorDetails : "Не вдалося відправити SMS"}`,
        );
      } else {
        toast.success("SMS успішно відправлено!");
      }
    } catch (err) {
      console.error("Error invoking notification function:", err);
      toast.error("Помилка відправки SMS.");
    }
  };

  const handleInputChange = useCallback((e, id) => {
    const { name, value } = e.target;
    setWorkTypes((prev) =>
      prev.map((wt) => (wt.id === id ? { ...wt, [name]: value } : wt)),
    );
  }, []);

  const handleNewInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setNewWorkType((prev) => ({ ...prev, [name]: value }));
  }, []);

  const toggleNoteInput = (id) => {
    setVisibleNoteIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDuplicateWorkType = async (wt) => {
    const payload = {
      address_id: addressId,
      work_type_template_id: wt.work_type_template_id,
      person_id: null,
      payment_amount: wt.payment_amount ? parseFloat(wt.payment_amount) : 0,
      notes: wt.notes || wt.line_notes || null,
      admin_note: wt.admin_note || null,
      date: wt.date || null,
    };

    const addedWorkType = await addWorkTypeAndInvoice(payload);

    if (addedWorkType) {
      setWorkTypes([...workTypes, addedWorkType]);
      toast.success("Роботу здубльовано!");
    } else {
      toast.error("Помилка дублювання.");
    }
  };

  const handleAddWorkType = async () => {
    if (!newWorkType.work_type_template_id) {
      toast.error("Please select a Work Type first.");
      return;
    }

    const payload = {
      address_id: addressId,
      work_type_template_id: newWorkType.work_type_template_id,
      person_id: newWorkType.person_id || null,
      payment_amount: newWorkType.payment_amount
        ? parseFloat(newWorkType.payment_amount)
        : 0,
      date: newWorkType.date || null,
    };

    const addedWorkType = await addWorkTypeAndInvoice(payload);

    if (addedWorkType) {
      setWorkTypes([...workTypes, addedWorkType]);

      if (addedWorkType.person_id) {
        await sendNotification(addedWorkType.person_id);
      }

      setNewWorkType({
        work_type_template_id: "",
        person_id: "",
        payment_amount: "",
        date: "",
      });
    }
  };

  const handleUpdateWorkType = async (id) => {
    const workTypeToUpdate = workTypes.find((wt) => wt.id === id);
    if (!workTypeToUpdate) return;

    const { data: originalWorkType } = await supabase
      .from("work_types")
      .select("person_id")
      .eq("id", id)
      .single();

    const oldPersonId = originalWorkType?.person_id;

    const noteToSave =
      workTypeToUpdate.notes !== undefined && workTypeToUpdate.notes !== null
        ? workTypeToUpdate.notes
        : workTypeToUpdate.line_notes || null;

    const updatePayload = {
      ...workTypeToUpdate,
      work_type_template_id: workTypeToUpdate.work_type_template_id || null,
      person_id: workTypeToUpdate.person_id || null,
      payment_amount: workTypeToUpdate.payment_amount
        ? parseFloat(workTypeToUpdate.payment_amount)
        : 0,
      notes: noteToSave,
      admin_note: workTypeToUpdate.admin_note || null,
      date: workTypeToUpdate.date || null,
    };

    const success = await updateWorkTypeAndInvoice(updatePayload);

    if (success !== false) {
      toast.success("Work type & invoice updated successfully!");
      setVisibleNoteIds((prev) => ({ ...prev, [id]: false }));

      if (updatePayload.person_id && updatePayload.person_id !== oldPersonId) {
        await sendNotification(updatePayload.person_id);
      }
    } else {
      toast.error("Failed to update work type.");
    }
  };

  const handleDeleteWorkType = async (id) => {
    await deleteWorkTypeAndInvoice(id);
    setWorkTypes(workTypes.filter((wt) => wt.id !== id));
  };

  if (loading || listsLoading) return <p>Loading work types...</p>;

  return (
    <div className={styles.container}>
      <div className={styles.workTypeList}>
        {workTypes.map((wt) => (
          <div key={wt.id} className={styles.workTypeBlock}>
            <div className={styles.workTypeItem}>
              <SearchableSelect
                options={workTypeTemplates}
                value={wt.work_type_template_id}
                placeholder="Пошук роботи..."
                onChange={(val) =>
                  handleInputChange(
                    { target: { name: "work_type_template_id", value: val } },
                    wt.id,
                  )
                }
              />

              <select
                name="person_id"
                value={wt.person_id || ""}
                onChange={(e) => handleInputChange(e, wt.id)}
                className={styles.selectWorker}
              >
                <option value="">Unassigned</option>
                {people.map((p) => {
                  if (p.status === "active" || p.id === wt.person_id) {
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.status !== "active" ? "(Inactive)" : ""}
                      </option>
                    );
                  }
                  return null;
                })}
              </select>

              <input
                type="date"
                name="date"
                title="Дата виконання цієї роботи"
                value={wt.date || ""}
                onChange={(e) => handleInputChange(e, wt.id)}
                className={styles.inputDate}
              />

              <input
                type="number"
                name="payment_amount"
                placeholder="0.00"
                value={wt.payment_amount || ""}
                onChange={(e) => handleInputChange(e, wt.id)}
                className={styles.inputAmount}
              />

              <div className={styles.actions}>
                <button
                  onClick={() => toggleNoteInput(wt.id)}
                  className={styles.actionBtn}
                  style={{ color: "#0dcaf0" }}
                  title="Додати/Редагувати інструкцію"
                >
                  <FaRegCommentDots />
                </button>
                <button
                  onClick={() => handleDuplicateWorkType(wt)}
                  className={styles.actionBtn}
                  style={{ color: "#6c757d" }}
                  title="Дублювати роботу"
                >
                  <FaCopy />
                </button>
                <button
                  onClick={() => handleUpdateWorkType(wt.id)}
                  className={styles.actionBtn}
                  style={{ color: "var(--color-primary)" }}
                  title="Зберегти"
                >
                  <FaSave />
                </button>
                <button
                  onClick={() => handleDeleteWorkType(wt.id)}
                  className={styles.actionBtn}
                  style={{ color: "#dc3545" }}
                  title="Видалити"
                >
                  <FaTrash />
                </button>
              </div>
            </div>

            {/* РЕДАГУВАННЯ ДВОХ ТИПІВ НОТАТОК */}
            {visibleNoteIds[wt.id] ? (
              <div
                className={styles.noteEditBox}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      color: "#666",
                    }}
                  >
                    Опис роботи / Інструкція (З ШІ або загальна):
                  </label>
                  <textarea
                    name="notes"
                    value={
                      wt.notes !== undefined && wt.notes !== null
                        ? wt.notes
                        : wt.line_notes || ""
                    }
                    onChange={(e) => handleInputChange(e, wt.id)}
                    placeholder="Введіть опис роботи..."
                    className={styles.noteTextarea}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: "bold",
                      color: "#b02a48",
                    }}
                  >
                    Нотатка для працівника (Особиста):
                  </label>
                  <textarea
                    name="admin_note"
                    value={wt.admin_note || ""}
                    onChange={(e) => handleInputChange(e, wt.id)}
                    placeholder="Наприклад: 'Подзвони як закінчиш', 'Ключ під килимком'..."
                    className={styles.noteTextarea}
                    style={{ borderColor: "#b02a48" }}
                  />
                </div>
              </div>
            ) : wt.notes || wt.line_notes || wt.admin_note ? (
              <div
                className={styles.lineNotesBox}
                onClick={() => toggleNoteInput(wt.id)}
                title="Натисніть щоб редагувати"
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                }}
              >
                {(wt.notes || wt.line_notes) && (
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-start",
                    }}
                  >
                    <FaInfoCircle className={styles.infoIcon} />
                    <span className={styles.notesText}>
                      {wt.notes || wt.line_notes}
                    </span>
                  </div>
                )}
                {wt.admin_note && (
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      alignItems: "flex-start",
                      marginTop: wt.notes || wt.line_notes ? "4px" : "0",
                    }}
                  >
                    <FaInfoCircle
                      className={styles.infoIcon}
                      style={{ color: "#b02a48" }}
                    />
                    <span
                      className={styles.notesText}
                      style={{ color: "#b02a48", fontWeight: "600" }}
                    >
                      Менеджер: {wt.admin_note}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div
        className={styles.workTypeBlock}
        style={{
          borderStyle: "dashed",
          borderColor: "#cfa85c",
          backgroundColor: "#fcfcfc",
        }}
      >
        <div className={styles.addWorkTypeForm}>
          <SearchableSelect
            options={workTypeTemplates}
            value={newWorkType.work_type_template_id}
            placeholder="Введіть назву роботи..."
            onChange={(val) =>
              handleNewInputChange({
                target: { name: "work_type_template_id", value: val },
              })
            }
          />

          <select
            name="person_id"
            value={newWorkType.person_id}
            onChange={handleNewInputChange}
            className={styles.selectWorker}
          >
            <option value="">Assign Worker</option>
            {people.map((p) => {
              if (p.status === "active") {
                return (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                );
              }
              return null;
            })}
          </select>

          <input
            type="date"
            name="date"
            title="Дата виконання цієї роботи"
            value={newWorkType.date || ""}
            onChange={handleNewInputChange}
            className={styles.inputDate}
          />

          <input
            type="number"
            name="payment_amount"
            placeholder="Amount"
            value={newWorkType.payment_amount}
            onChange={handleNewInputChange}
            className={styles.inputAmount}
          />

          <button onClick={handleAddWorkType} className={styles.addButton}>
            <FaPlus /> Add
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkTypesManager;
