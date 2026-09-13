// src/components/PeopleList/PeopleList.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaUser, FaPhone, FaSyncAlt, FaEye } from "react-icons/fa";
import { MdOutlineChevronRight } from "react-icons/md";
import styles from "./PeopleList.module.css";

const PeopleList = ({
  people,
  isEditing,
  onToggleStatus,
  onUpdatePersonName,
  onUpdatePersonPhone,
}) => {
  const navigate = useNavigate();
  const [editedNames, setEditedNames] = useState({});
  const [editedPhones, setEditedPhones] = useState({});

  useEffect(() => {
    const namesMap = {};
    const phonesMap = {};
    people.forEach((person) => {
      namesMap[person.id] = person.name;
      phonesMap[person.id] = person.phone || "";
    });
    setEditedNames(namesMap);
    setEditedPhones(phonesMap);
  }, [people]);

  const handleNameChange = useCallback((id, value) => {
    setEditedNames((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handlePhoneChange = useCallback((id, value) => {
    setEditedPhones((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleNameSave = useCallback(
    (id) => {
      const originalPerson = people.find((p) => p.id === id);
      if (
        originalPerson &&
        originalPerson.name !== editedNames[id].trim() &&
        editedNames[id].trim() !== ""
      ) {
        onUpdatePersonName(id, editedNames[id].trim());
      } else {
        setEditedNames((prev) => ({ ...prev, [id]: originalPerson.name }));
      }
    },
    [people, editedNames, onUpdatePersonName],
  );

  const handlePhoneSave = useCallback(
    (id) => {
      const originalPerson = people.find((p) => p.id === id);
      if (originalPerson && originalPerson.phone !== editedPhones[id].trim()) {
        onUpdatePersonPhone(id, editedPhones[id].trim());
      }
    },
    [people, editedPhones, onUpdatePersonPhone],
  );

  const handlePersonClick = useCallback(
    (personId) => {
      if (isEditing) return;
      navigate(`/person/${personId}`);
    },
    [isEditing, navigate],
  );

  return (
    <div className={styles.peopleListContainer}>
      <div className={styles.cardsList}>
        {people.length > 0 ? (
          people.map((person) => (
            <div
              key={person.id}
              className={`${styles.card} ${isEditing ? styles.editing : ""}`}
              onClick={() => handlePersonClick(person.id)}
            >
              <div className={styles.cardContent}>
                {isEditing ? (
                  <div className={styles.editForm}>
                    <input
                      type="text"
                      value={editedNames[person.id] || ""}
                      className={styles.editInput}
                      onChange={(e) =>
                        handleNameChange(person.id, e.target.value)
                      }
                      onBlur={() => handleNameSave(person.id)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Name"
                    />
                    <input
                      type="tel"
                      value={editedPhones[person.id] || ""}
                      className={styles.editInput}
                      onChange={(e) =>
                        handlePhoneChange(person.id, e.target.value)
                      }
                      onBlur={() => handlePhoneSave(person.id)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Phone number"
                    />
                    <button
                      className={styles.toggleStatusButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStatus(person.id, person.status);
                      }}
                    >
                      <FaSyncAlt />{" "}
                      {person.status === "active"
                        ? "Set Inactive"
                        : "Set Active"}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitle}>
                        <FaUser className={styles.iconGold} />
                        {person.name}
                      </div>

                      <div className={styles.headerBadges}>
                        <span
                          className={`${styles.statusBadge} ${
                            person.status === "active"
                              ? styles.active
                              : styles.inactive
                          }`}
                        >
                          {person.status}
                        </span>

                        {/* КНОПКА КАБІНЕТУ */}
                        <button
                          className={styles.viewAsButton}
                          onClick={(e) => {
                            e.stopPropagation(); // щоб не відкривалася загальна сторінка Person
                            navigate(`/worker-view/${person.id}`);
                          }}
                          title="Відкрити кабінет працівника"
                        >
                          <FaEye /> Кабінет
                        </button>
                      </div>
                    </div>
                    {person.phone && (
                      <div className={styles.cardSubtitle}>
                        <FaPhone className={styles.iconSmall} />
                        {person.phone}
                      </div>
                    )}
                  </>
                )}
              </div>
              {!isEditing && (
                <MdOutlineChevronRight className={styles.chevronIcon} />
              )}
            </div>
          ))
        ) : (
          <div className={styles.noItemsMessage}>
            No people available in this list
          </div>
        )}
      </div>
    </div>
  );
};

export default PeopleList;
